import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthUser } from '../auth/auth.types';

@Injectable()
export class BookingsAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(BookingsAuthGuard.name);

  override handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      if (err) {
        this.logger.error('handleRequest failed', err as Error);
      }
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    }
    return user;
  }
}
