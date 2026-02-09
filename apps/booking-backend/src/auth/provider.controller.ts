import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller('provider')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProviderController {
  @Get('ping')
  @roles('provider')
  ping(): { ok: true } {
    return { ok: true };
  }
}
