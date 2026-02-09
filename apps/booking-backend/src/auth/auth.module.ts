import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DbModule } from '../db/db.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { MeController } from './me.controller';
import { AdminController } from './admin.controller';
import { RolesGuard } from './roles.guard';
import { AdminGuard } from './admin.guard';
import { GoogleStrategy } from './google.strategy';
import { ProviderController } from './provider.controller';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [
    AuthController,
    MeController,
    AdminController,
    ProviderController,
  ],
  providers: [AuthService, JwtStrategy, RolesGuard, AdminGuard, GoogleStrategy],
})
export class AuthModule {}
