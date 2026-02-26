import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { DRIZZLE_DB } from '../db/drizzle';
import type { DbClient } from '../db/drizzle';
import { bookings, customerProfiles, providerProfiles } from '../db/schema';
import type { BookingStatus } from './bookings.types';

type CreateBookingParams = {
  providerUserId: string;
  customerUserId: string;
  startTime: string;
  endTime: string;
  idempotencyKey?: string;
};

type ListBookingsParams = {
  cursor?: string;
  limit: number;
  providerUserId?: string;
  customerUserId?: string;
  status?: BookingStatus;
};

type UpdateStatusParams = {
  bookingId: string;
  status: BookingStatus;
  currentStatus: BookingStatus;
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(@Inject(DRIZZLE_DB) private readonly db: DbClient) {}

  async createBooking(params: CreateBookingParams): Promise<{
    booking: typeof bookings.$inferSelect;
    idempotent: boolean;
  }> {
    this.logger.log('createBooking start');
    if (params.providerUserId === params.customerUserId) {
      this.logger.warn('createBooking rejected: self-booking');
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Bad request',
      });
    }

    const [providerProfile] = await this.db
      .select({ userId: providerProfiles.userId })
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, params.providerUserId))
      .limit(1);

    if (!providerProfile) {
      this.logger.warn('createBooking rejected: provider missing');
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Bad request',
      });
    }

    const [customerProfile] = await this.db
      .select({ userId: customerProfiles.userId })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, params.customerUserId))
      .limit(1);

    if (!customerProfile) {
      this.logger.warn('createBooking rejected: customer missing');
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Bad request',
      });
    }

    if (params.idempotencyKey) {
      const [existing] = await this.db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.providerUserId, params.providerUserId),
            eq(bookings.customerUserId, params.customerUserId),
            eq(bookings.idempotencyKey, params.idempotencyKey),
          ),
        )
        .limit(1);

      if (existing) {
        const matches = this.matchesIdempotencyPayload(existing, params);
        if (!matches) {
          this.logger.warn('createBooking conflict: idempotency mismatch');
          throw new ConflictException({
            code: 'CONFLICT',
            message: 'Idempotency key conflict',
          });
        }

        this.logger.log('createBooking idempotent hit');
        return { booking: existing, idempotent: true };
      }
    }

    const [created] = await this.db
      .insert(bookings)
      .values({
        providerUserId: params.providerUserId,
        customerUserId: params.customerUserId,
        startTime: new Date(params.startTime),
        endTime: new Date(params.endTime),
        status: 'pending',
        idempotencyKey: params.idempotencyKey ?? null,
      })
      .returning();

    if (!created) {
      this.logger.error('createBooking failed: no record created');
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Bad request',
      });
    }

    this.logger.log(`createBooking success: ${created.id}`);
    return { booking: created, idempotent: false };
  }

  async getBookingById(
    bookingId: string,
  ): Promise<typeof bookings.$inferSelect> {
    const [booking] = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      this.logger.warn(`getBookingById not found: ${bookingId}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Booking not found',
      });
    }

    this.logger.log(`getBookingById success: ${bookingId}`);

    return booking;
  }

  async listBookings(params: ListBookingsParams): Promise<{
    items: (typeof bookings.$inferSelect)[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const conditions: SQL[] = [];
    if (params.providerUserId) {
      conditions.push(eq(bookings.providerUserId, params.providerUserId));
    }
    if (params.customerUserId) {
      conditions.push(eq(bookings.customerUserId, params.customerUserId));
    }
    if (params.status) {
      conditions.push(eq(bookings.status, params.status));
    }

    if (params.cursor) {
      const { startTime, id } = this.decodeCursor(params.cursor);
      const cursorCondition = sql`${bookings.startTime} > ${startTime} or (${bookings.startTime} = ${startTime} and ${bookings.id} > ${id})`;
      conditions.push(cursorCondition);
    }

    const baseQuery = this.db.select().from(bookings);
    const filteredQuery =
      conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

    const rows = await filteredQuery
      .orderBy(asc(bookings.startTime), asc(bookings.id))
      .limit(params.limit + 1);

    const hasMore = rows.length > params.limit;
    const items = hasMore ? rows.slice(0, params.limit) : rows;
    const nextCursor = hasMore
      ? this.encodeCursor(items[items.length - 1])
      : null;

    return { items, nextCursor, hasMore };
  }

  async updateStatus(
    params: UpdateStatusParams,
  ): Promise<typeof bookings.$inferSelect> {
    this.logger.log(`updateStatus start: ${params.bookingId}`);
    const [updated] = await this.db
      .update(bookings)
      .set({ status: params.status, updatedAt: new Date() })
      .where(
        and(
          eq(bookings.id, params.bookingId),
          eq(bookings.status, params.currentStatus),
        ),
      )
      .returning();

    if (!updated) {
      const [existing] = await this.db
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.id, params.bookingId))
        .limit(1);

      if (!existing) {
        this.logger.warn(`updateStatus not found: ${params.bookingId}`);
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Booking not found',
        });
      }

      this.logger.warn(`updateStatus conflict: ${params.bookingId}`);
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Status changed, retry',
      });
    }

    this.logger.log(`updateStatus success: ${params.bookingId}`);

    return updated;
  }

  private matchesIdempotencyPayload(
    booking: typeof bookings.$inferSelect,
    params: CreateBookingParams,
  ): boolean {
    return (
      booking.providerUserId === params.providerUserId &&
      booking.startTime.toISOString() ===
        new Date(params.startTime).toISOString() &&
      booking.endTime.toISOString() === new Date(params.endTime).toISOString()
    );
  }

  private decodeCursor(cursor: string): { startTime: Date; id: string } {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [startTime, id] = decoded.split('|');
    return { startTime: new Date(startTime), id };
  }

  private encodeCursor(booking: typeof bookings.$inferSelect): string {
    return Buffer.from(
      `${booking.startTime.toISOString()}|${booking.id}`,
      'utf8',
    ).toString('base64url');
  }
}
