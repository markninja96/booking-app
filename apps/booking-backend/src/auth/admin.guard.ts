import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE_DB } from '../db/drizzle';
import type { DbClient } from '../db/drizzle';
import { userRoles } from '../db/schema';
import type { AuthUser } from './auth.types';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DbClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      return false;
    }

    const adminUserId = user.actorUserId ?? user.userId;
    const [row] = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, adminUserId), eq(userRoles.role, 'admin')),
      )
      .limit(1);

    return row?.role === 'admin';
  }
}
