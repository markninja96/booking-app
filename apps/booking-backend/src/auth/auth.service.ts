import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { hash, compare } from 'bcryptjs';
import { DRIZZLE_DB } from '../db/drizzle';
import type { DbClient } from '../db/drizzle';
import { users } from '../db/schema';
import type { JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(DRIZZLE_DB) private readonly db: DbClient,
  ) {}

  async register(params: {
    fname: string;
    lname: string;
    email: string;
    password: string;
  }): Promise<{ accessToken: string }> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, params.email))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await hash(params.password, 10);
    const [created] = await this.db
      .insert(users)
      .values({
        fname: params.fname,
        lname: params.lname,
        email: params.email,
        passwordHash,
      })
      .returning({ id: users.id });

    return { accessToken: await this.createAccessToken(created.id) };
  }

  async login(params: {
    email: string;
    password: string;
  }): Promise<{ accessToken: string }> {
    const [user] = await this.db
      .select({ id: users.id, passwordHash: users.passwordHash })
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

    return { accessToken: await this.createAccessToken(user.id) };
  }

  async createAccessToken(userId: string): Promise<string> {
    const payload: JwtPayload = {
      sub: userId,
      roles: [],
      activeRole: null,
      actorUserId: null,
      subjectUserId: null,
    };

    return this.jwtService.signAsync(payload);
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
}
