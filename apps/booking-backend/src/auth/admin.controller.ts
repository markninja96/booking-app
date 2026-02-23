import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import type { AuthUser } from './auth.types';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiTags('Admin')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly authService: AuthService) {}

  @Get('ping')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  })
  @ApiForbiddenResponse({
    schema: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  })
  ping(): { ok: true } {
    return { ok: true };
  }

  @HttpCode(200)
  @Post('users/:id/roles/grant')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['admin', 'provider', 'customer'] },
        businessName: { type: 'string' },
      },
      required: ['role'],
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        roles: { type: 'array', items: { type: 'string' } },
        activeRole: { type: 'string', nullable: true },
      },
    },
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  })
  @ApiForbiddenResponse({
    schema: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  })
  async grantRole(
    @Param('id') userId: string,
    @Body() body: unknown,
  ): Promise<{ roles: string[]; activeRole: string | null }> {
    const params = parseBody(grantRoleSchema, body);
    return this.authService.grantRoleToUser({ userId, ...params });
  }

  @HttpCode(200)
  @Post('users/:id/roles/revoke')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['admin', 'provider', 'customer'] },
      },
      required: ['role'],
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        roles: { type: 'array', items: { type: 'string' } },
        activeRole: { type: 'string', nullable: true },
      },
    },
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  })
  @ApiForbiddenResponse({
    schema: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  })
  async revokeRole(
    @Param('id') userId: string,
    @Body() body: unknown,
  ): Promise<{ roles: string[]; activeRole: string | null }> {
    const params = parseBody(revokeRoleSchema, body);
    return this.authService.revokeRoleFromUser({ userId, ...params });
  }

  @HttpCode(200)
  @Post('impersonation/start')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { subjectUserId: { type: 'string' } },
      required: ['subjectUserId'],
    },
  })
  @ApiOkResponse({
    schema: { type: 'object', properties: { accessToken: { type: 'string' } } },
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  })
  @ApiForbiddenResponse({
    schema: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  })
  async startImpersonation(
    @Req() req: Request & { user: AuthUser },
    @Body() body: unknown,
  ): Promise<{ accessToken: string }> {
    const params = parseBody(impersonationStartSchema, body);
    const actorUserId = req.user.actorUserId ?? req.user.userId;
    return this.authService.startImpersonation({
      actorUserId,
      subjectUserId: params.subjectUserId,
    });
  }

  @HttpCode(200)
  @Post('impersonation/stop')
  @ApiOkResponse({
    schema: { type: 'object', properties: { accessToken: { type: 'string' } } },
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  })
  @ApiForbiddenResponse({
    schema: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  })
  async stopImpersonation(
    @Req() req: Request & { user: AuthUser },
  ): Promise<{ accessToken: string }> {
    const actorUserId = req.user.actorUserId ?? req.user.userId;
    return this.authService.stopImpersonation(actorUserId);
  }
}

const grantRoleSchema = z.object({
  role: z.enum(['admin', 'provider', 'customer']),
  businessName: z.string().min(1).optional(),
});

const revokeRoleSchema = z.object({
  role: z.enum(['admin', 'provider', 'customer']),
});

const impersonationStartSchema = z.object({
  subjectUserId: z.string().uuid(),
});

const parseBody = <T>(schema: z.ZodSchema<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
};
