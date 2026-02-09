import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthUser } from './auth.types';

const DEFAULT_PASSWORD_DENYLIST = new Set([
  'Password123!',
  'Password123@',
  'Password123#',
  'Qwerty123!',
  'Qwerty123@',
  'Qwerty123#',
  'Letmein123!',
  'Letmein123@',
  'Letmein123#',
]);

const loadPasswordDenylist = (): Set<string> => {
  const candidates = [
    join(process.cwd(), 'apps/booking-backend/src/auth/password-denylist.txt'),
    join(__dirname, 'password-denylist.txt'),
  ];

  for (const filePath of candidates) {
    try {
      const contents = readFileSync(filePath, 'utf-8');
      const entries = contents
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

      if (entries.length > 0) {
        return new Set(entries);
      }
    } catch {
      continue;
    }
  }

  return DEFAULT_PASSWORD_DENYLIST;
};

const PASSWORD_DENYLIST = loadPasswordDenylist();

const passwordSchema = z
  .string()
  .min(12, { message: 'Password must be at least 12 characters' })
  .regex(/[a-z]/, { message: 'Password must include a lowercase letter' })
  .regex(/[A-Z]/, { message: 'Password must include an uppercase letter' })
  .regex(/\d/, { message: 'Password must include a number' })
  .regex(/[^A-Za-z\d]/, { message: 'Password must include a symbol' })
  .refine((value) => !PASSWORD_DENYLIST.has(value), {
    message: 'Password is too common',
  });

const registerSchema = z
  .object({
    fname: z.string().min(1),
    lname: z.string().min(1),
    email: z.string().email(),
    password: passwordSchema,
    role: z.enum(['customer', 'provider']),
    businessName: z.string().min(1).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.role === 'provider' && !values.businessName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Business name is required',
        path: ['businessName'],
      });
    }
  });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const devTokenSchema = z.object({
  userId: z.string().uuid(),
});

const activeRoleSchema = z.object({
  activeRole: z.enum(['customer', 'provider']),
});

const providerUpgradeSchema = z.object({
  businessName: z.string().min(1),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  async register(@Body() body: unknown): Promise<{ accessToken: string }> {
    const params = parseBody(registerSchema, body);
    return this.authService.register(params);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(): Promise<{ ok: true }> {
    return { ok: true };
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request & { user: { userId: string } },
  ): Promise<{ accessToken: string }> {
    return {
      accessToken: await this.authService.createAccessTokenForUser(
        req.user.userId,
      ),
    };
  }

  @HttpCode(200)
  @Post('login')
  async login(@Body() body: unknown): Promise<{ accessToken: string }> {
    const params = parseBody(loginSchema, body);
    return this.authService.login(params);
  }

  @Post('dev-token')
  async devToken(@Body() body: unknown): Promise<{ accessToken: string }> {
    const devTokensEnabled =
      this.configService.get<string>('AUTH_DEV_TOKENS') === 'true';
    const nodeEnv = this.configService.get<string>('NODE_ENV');

    if (!devTokensEnabled || nodeEnv === 'production') {
      throw new BadRequestException('Dev tokens are disabled');
    }

    const params = parseBody(devTokenSchema, body);
    return {
      accessToken: await this.authService.createAccessTokenForUser(
        params.userId,
      ),
    };
  }

  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Post('active-role')
  async activeRole(
    @Req() req: Request & { user: AuthUser },
    @Body() body: unknown,
  ): Promise<{ accessToken: string }> {
    const params = parseBody(activeRoleSchema, body);
    return this.authService.setActiveRole(req.user.userId, params.activeRole);
  }

  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Post('upgrade/provider')
  async upgradeToProvider(
    @Req() req: Request & { user: AuthUser },
    @Body() body: unknown,
  ): Promise<{ accessToken: string }> {
    const params = parseBody(providerUpgradeSchema, body);
    return this.authService.upgradeToProvider(req.user.userId, params);
  }
}

const parseBody = <T>(schema: z.ZodSchema<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
};
