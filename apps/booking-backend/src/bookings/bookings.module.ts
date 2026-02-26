import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsAuthGuard } from './bookings-auth.guard';

@Module({
  imports: [DbModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsAuthGuard],
})
export class BookingsModule {}
