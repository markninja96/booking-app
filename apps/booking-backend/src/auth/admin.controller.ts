import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Get('ping')
  @roles('admin')
  ping(): { ok: true } {
    return { ok: true };
  }
}
