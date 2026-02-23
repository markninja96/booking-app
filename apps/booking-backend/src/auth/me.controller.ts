import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthUser } from './auth.types';

@Controller()
export class MeController {
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiTags('Auth')
  @ApiBearerAuth()
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        roles: { type: 'array', items: { type: 'string' } },
        activeRole: { type: 'string', nullable: true },
        actorUserId: { type: 'string', nullable: true },
        subjectUserId: { type: 'string', nullable: true },
      },
    },
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
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
