import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthUser } from './auth.types';

@Controller()
export class MeController {
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: Request & { user: AuthUser }): {
    userId: string;
    roles: string[];
    activeRole: string | null;
    actorUserId: string | null;
    subjectUserId: string | null;
  } {
    const user = req.user;
    return {
      userId: user.userId,
      roles: user.roles,
      activeRole: user.activeRole,
      actorUserId: user.actorUserId,
      subjectUserId: user.subjectUserId,
    };
  }
}
