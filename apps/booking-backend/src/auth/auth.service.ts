import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, asc, eq } from 'drizzle-orm';
import { hash, compare } from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE_DB } from '../db/drizzle';
import type { DbClient } from '../db/drizzle';
import {
  authIdentities,
  customerProfiles,
  providerProfiles,
  userRoles,
  users,
} from '../db/schema';
import type { JwtPayload, UserRole } from './auth.types';
import type { Profile } from 'passport-google-oauth20';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(DRIZZLE_DB) private readonly db: DbClient,
  ) {}

  async register(params: {
    fname: string;
    lname: string;
    email: string;
    password: string;
    role: UserRole;
    businessName?: string;
  }): Promise<{ accessToken: string }> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, params.email))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('Email already in use');
    }

    if (params.role === 'provider' && !params.businessName) {
      throw new BadRequestException('Business name is required');
    }

    const passwordHash = await hash(params.password, 10);
    const created = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          fname: params.fname,
          lname: params.lname,
          email: params.email,
          passwordHash,
          activeRole: params.role,
        })
        .returning({ id: users.id });

      await tx.insert(userRoles).values({
        userId: user.id,
        role: params.role,
      });

      if (params.role === 'provider') {
        await tx
          .insert(userRoles)
          .values({ userId: user.id, role: 'customer' })
          .onConflictDoNothing();
        await tx.insert(providerProfiles).values({
          userId: user.id,
          businessName: params.businessName ?? '',
        });
        await tx.insert(customerProfiles).values({
          userId: user.id,
        });
      }

      if (params.role === 'customer') {
        await tx.insert(customerProfiles).values({
          userId: user.id,
        });
      }

      if (this.shouldBootstrapAdmin(params.email)) {
        await tx
          .insert(userRoles)
          .values({ userId: user.id, role: 'admin' })
          .onConflictDoNothing();
      }

      return user;
    });

    const roles = await this.getUserRoles(created.id);
    return {
      accessToken: await this.createAccessToken({
        userId: created.id,
        roles,
        activeRole: params.role,
      }),
    };
  }

  async login(params: {
    email: string;
    password: string;
  }): Promise<{ accessToken: string }> {
    const [user] = await this.db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        activeRole: users.activeRole,
      })
      .from(users)
      .where(eq(users.email, params.email))
      .limit(1);

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await compare(params.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.shouldBootstrapAdmin(params.email)) {
      await this.db
        .insert(userRoles)
        .values({ userId: user.id, role: 'admin' })
        .onConflictDoNothing();
    }

    const roles = await this.getUserRoles(user.id);
    const activeRole = this.resolveActiveRole(
      (user.activeRole ?? null) as UserRole | null,
      roles,
    );
    return {
      accessToken: await this.createAccessToken({
        userId: user.id,
        roles,
        activeRole,
      }),
    };
  }

  async createAccessToken(params: {
    userId: string;
    roles: UserRole[];
    activeRole: UserRole | null;
    actorUserId?: string | null;
    subjectUserId?: string | null;
  }): Promise<string> {
    const payload: JwtPayload = {
      sub: params.userId,
      roles: params.roles,
      activeRole: params.activeRole,
      actorUserId: params.actorUserId ?? null,
      subjectUserId: params.subjectUserId ?? null,
    };

    return this.jwtService.signAsync(payload);
  }

  async createAccessTokenForUser(userId: string): Promise<string> {
    await this.ensureUserExists(userId);
    const roles = await this.getUserRoles(userId);
    const activeRole = await this.getUserActiveRole(userId, roles);
    return this.createAccessToken({ userId, roles, activeRole });
  }

  async setActiveRole(
    userId: string,
    activeRole: UserRole,
  ): Promise<{ accessToken: string }> {
    const roles = await this.getUserRoles(userId);
    if (!roles.includes(activeRole)) {
      throw new BadRequestException('Role not assigned');
    }

    if (activeRole === 'provider') {
      const [profile] = await this.db
        .select({ userId: providerProfiles.userId })
        .from(providerProfiles)
        .where(eq(providerProfiles.userId, userId))
        .limit(1);

      if (!profile) {
        throw new BadRequestException('Provider profile missing');
      }
    }

    if (activeRole === 'customer') {
      const [profile] = await this.db
        .select({ userId: customerProfiles.userId })
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, userId))
        .limit(1);

      if (!profile) {
        throw new BadRequestException('Customer profile missing');
      }
    }

    await this.db.update(users).set({ activeRole }).where(eq(users.id, userId));

    return {
      accessToken: await this.createAccessToken({
        userId,
        roles,
        activeRole,
      }),
    };
  }

  async upgradeToProvider(
    userId: string,
    params: { businessName: string },
  ): Promise<{ accessToken: string }> {
    const roles = await this.getUserRoles(userId);
    const activeRole = await this.getUserActiveRole(userId, roles);

    await this.db.transaction(async (tx) => {
      await tx
        .insert(providerProfiles)
        .values({ userId, businessName: params.businessName })
        .onConflictDoNothing();

      await tx
        .insert(userRoles)
        .values({ userId, role: 'provider' })
        .onConflictDoNothing();
    });

    const updated = await this.getUserRoles(userId);

    const nextActiveRole =
      activeRole && updated.includes(activeRole)
        ? activeRole
        : this.resolveActiveRole(activeRole, updated);

    return {
      accessToken: await this.createAccessToken({
        userId,
        roles: updated,
        activeRole: nextActiveRole,
      }),
    };
  }

  async grantRoleToUser(params: {
    userId: string;
    role: UserRole;
    businessName?: string;
  }): Promise<{ roles: UserRole[]; activeRole: UserRole | null }> {
    await this.ensureUserExists(params.userId);

    if (params.role === 'provider') {
      const [profile] = await this.db
        .select({ userId: providerProfiles.userId })
        .from(providerProfiles)
        .where(eq(providerProfiles.userId, params.userId))
        .limit(1);

      if (!profile) {
        if (!params.businessName) {
          throw new BadRequestException('Business name is required');
        }
        await this.db.insert(providerProfiles).values({
          userId: params.userId,
          businessName: params.businessName,
        });
      }

      await this.db
        .insert(userRoles)
        .values({ userId: params.userId, role: 'customer' })
        .onConflictDoNothing();

      const [customerProfile] = await this.db
        .select({ userId: customerProfiles.userId })
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, params.userId))
        .limit(1);

      if (!customerProfile) {
        await this.db
          .insert(customerProfiles)
          .values({ userId: params.userId });
      }
    }

    if (params.role === 'customer') {
      const [profile] = await this.db
        .select({ userId: customerProfiles.userId })
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, params.userId))
        .limit(1);

      if (!profile) {
        await this.db
          .insert(customerProfiles)
          .values({ userId: params.userId });
      }
    }

    await this.db
      .insert(userRoles)
      .values({ userId: params.userId, role: params.role })
      .onConflictDoNothing();

    const roles = await this.getUserRoles(params.userId);
    const activeRole = await this.getUserActiveRole(params.userId, roles);
    if (!activeRole && params.role !== 'admin') {
      await this.db
        .update(users)
        .set({ activeRole: params.role })
        .where(eq(users.id, params.userId));
      return { roles, activeRole: params.role };
    }

    return { roles, activeRole };
  }

  async revokeRoleFromUser(params: {
    userId: string;
    role: UserRole;
  }): Promise<{ roles: UserRole[]; activeRole: UserRole | null }> {
    await this.db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, params.userId),
          eq(userRoles.role, params.role),
        ),
      );

    const roles = await this.getUserRoles(params.userId);
    const [row] = await this.db
      .select({ activeRole: users.activeRole })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    const currentActive = row?.activeRole as UserRole | null;
    if (currentActive === params.role) {
      const nextActive = this.getDefaultActiveRole(roles);
      await this.db
        .update(users)
        .set({ activeRole: nextActive })
        .where(eq(users.id, params.userId));
      return { roles, activeRole: nextActive };
    }

    return {
      roles,
      activeRole: this.resolveActiveRole(currentActive, roles),
    };
  }

  async startImpersonation(params: {
    actorUserId: string;
    subjectUserId: string;
  }): Promise<{ accessToken: string }> {
    await this.ensureUserExists(params.subjectUserId);
    const roles = await this.getUserRoles(params.subjectUserId);
    const activeRole = await this.getUserActiveRole(
      params.subjectUserId,
      roles,
    );

    return {
      accessToken: await this.createAccessToken({
        userId: params.subjectUserId,
        roles,
        activeRole,
        actorUserId: params.actorUserId,
        subjectUserId: params.subjectUserId,
      }),
    };
  }

  async stopImpersonation(
    actorUserId: string,
  ): Promise<{ accessToken: string }> {
    const accessToken = await this.createAccessTokenForUser(actorUserId);
    return { accessToken };
  }

  async handleGoogleLogin(profile: Profile): Promise<{ userId: string }> {
    const providerUserId = profile.id;
    const [identity] = await this.db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.oauthProvider, 'google'),
          eq(authIdentities.providerUserId, providerUserId),
        ),
      )
      .limit(1);

    if (identity) {
      return { userId: identity.userId };
    }

    const email = profile.emails?.[0]?.value?.toLowerCase();
    if (!email) {
      throw new BadRequestException('Google account email is required');
    }

    const [existingUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const userId = await this.db.transaction(async (tx) => {
      let userIdValue = existingUser?.id;
      if (!userIdValue) {
        const fname = profile.name?.givenName ?? 'Google';
        const lname = profile.name?.familyName ?? 'User';
        const [created] = await tx
          .insert(users)
          .values({
            fname,
            lname,
            email,
            passwordHash: null,
            activeRole: 'customer',
          })
          .returning({ id: users.id });

        await tx
          .insert(userRoles)
          .values({ userId: created.id, role: 'customer' })
          .onConflictDoNothing();

        await tx.insert(customerProfiles).values({ userId: created.id });
        userIdValue = created.id;
      }

      await tx
        .insert(authIdentities)
        .values({
          userId: userIdValue,
          oauthProvider: 'google',
          providerUserId,
        })
        .onConflictDoNothing();

      return userIdValue;
    });

    return { userId };
  }

  async ensureUserExists(userId: string): Promise<void> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundException('User not found');
    }
  }

  private async getUserRoles(userId: string): Promise<UserRole[]> {
    const rows = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId))
      .orderBy(asc(userRoles.role));

    return rows.map((row) => row.role as UserRole);
  }

  private shouldBootstrapAdmin(email: string): boolean {
    const bootstrapEmail = this.configService.get<string>(
      'BOOTSTRAP_ADMIN_EMAIL',
    );
    if (!bootstrapEmail) {
      return false;
    }
    return bootstrapEmail.toLowerCase() === email.toLowerCase();
  }

  private getDefaultActiveRole(roles: UserRole[]): UserRole | null {
    return roles.find((role) => role !== 'admin') ?? null;
  }

  private resolveActiveRole(
    storedRole: UserRole | null,
    roles: UserRole[],
  ): UserRole | null {
    if (storedRole && roles.includes(storedRole) && storedRole !== 'admin') {
      return storedRole;
    }
    return this.getDefaultActiveRole(roles);
  }

  private async getUserActiveRole(
    userId: string,
    roles: UserRole[],
  ): Promise<UserRole | null> {
    const [row] = await this.db
      .select({ activeRole: users.activeRole })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return this.resolveActiveRole(
      (row?.activeRole ?? null) as UserRole | null,
      roles,
    );
  }
}
