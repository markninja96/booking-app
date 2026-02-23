import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { BookingsAuthGuard } from './bookings-auth.guard';
import type { AuthUser } from '../auth/auth.types';
import {
  bookingIdParamSchema,
  createBookingSchema,
  listBookingsSchema,
  updateStatusSchema,
  type BookingIdParam,
  type CreateBookingInput,
  type ListBookingsInput,
  type UpdateStatusInput,
} from './bookings.schemas';
import { BookingsService } from './bookings.service';
import type { BookingResponse, BookingStatus } from './bookings.types';
import {
  BookingResponseDto,
  CreateBookingRequestDto,
  ErrorResponseDto,
  ListBookingsResponseDto,
  UpdateStatusRequestDto,
  ValidationErrorResponseDto,
} from './bookings.dto';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
@UseGuards(BookingsAuthGuard, ThrottlerGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @ApiBody({ type: CreateBookingRequestDto })
  @ApiCreatedResponse({ type: BookingResponseDto })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @Post()
  async createBooking(
    @Req() req: Request & { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(createBookingSchema, 'body'))
    body: CreateBookingInput,
  ): Promise<{ data: BookingResponse }> {
    const user = req.user;
    const subjectUserId = user.subjectUserId ?? user.userId;

    if (user.activeRole !== 'customer') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    }

    const result = await this.bookingsService.createBooking({
      providerUserId: body.providerUserId,
      customerUserId: subjectUserId,
      startTime: body.startTime,
      endTime: body.endTime,
      idempotencyKey: body.idempotencyKey,
    });

    res.status(result.idempotent ? 200 : 201);
    return {
      data: this.mapBooking(result.booking, { includeIdempotencyKey: true }),
    };
  }

  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  @Get(':id')
  async getBooking(
    @Req() req: Request & { user: AuthUser },
    @Param(new ZodValidationPipe(bookingIdParamSchema, 'params'))
    params: BookingIdParam,
  ): Promise<{ data: BookingResponse }> {
    const booking = await this.bookingsService.getBookingById(params.id);
    this.ensureCanRead(req.user, booking);

    return { data: this.mapBooking(booking) };
  }

  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'providerUserId', required: false })
  @ApiQuery({ name: 'customerUserId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ type: ListBookingsResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  @Get()
  async listBookings(
    @Req() req: Request & { user: AuthUser },
    @Query(new ZodValidationPipe(listBookingsSchema, 'query'))
    query: ListBookingsInput,
  ): Promise<{
    data: BookingResponse[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const user = req.user;
    const subjectUserId = user.subjectUserId ?? user.userId;
    const isAdmin = user.roles.includes('admin');
    const isImpersonating = Boolean(user.actorUserId);

    let providerUserId = query.providerUserId;
    let customerUserId = query.customerUserId;

    if (!isAdmin || isImpersonating) {
      if (user.activeRole !== 'customer' && user.activeRole !== 'provider') {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Forbidden',
        });
      }

      if (user.activeRole === 'customer') {
        customerUserId = subjectUserId;
        providerUserId = undefined;
      } else {
        providerUserId = subjectUserId;
        customerUserId = undefined;
      }
    }

    const result = await this.bookingsService.listBookings({
      cursor: query.cursor,
      limit: query.limit,
      providerUserId,
      customerUserId,
      status: query.status,
    });

    return {
      data: result.items.map((booking) => this.mapBooking(booking)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiBody({ type: UpdateStatusRequestDto })
  @ApiOkResponse({ type: BookingResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @Patch(':id/status')
  @HttpCode(200)
  async updateStatus(
    @Req() req: Request & { user: AuthUser },
    @Param(new ZodValidationPipe(bookingIdParamSchema, 'params'))
    params: BookingIdParam,
    @Body(new ZodValidationPipe(updateStatusSchema, 'body'))
    body: UpdateStatusInput,
  ): Promise<{ data: BookingResponse }> {
    const user = req.user;
    const isAdmin = user.roles.includes('admin');
    const isImpersonating = Boolean(user.actorUserId);

    if (isAdmin && !isImpersonating) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    }

    const booking = await this.bookingsService.getBookingById(params.id);
    const subjectUserId = user.subjectUserId ?? user.userId;
    const isProviderOwner = booking.providerUserId === subjectUserId;
    const isCustomerOwner = booking.customerUserId === subjectUserId;
    if (!isProviderOwner && !isCustomerOwner) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    }

    if (user.activeRole !== 'customer' && user.activeRole !== 'provider') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    }

    this.ensureTransitionAllowed({
      currentStatus: booking.status as BookingStatus,
      nextStatus: body.status as BookingStatus,
      activeRole: user.activeRole,
      isProviderOwner,
      isCustomerOwner,
      isImpersonating,
    });

    const updated = await this.bookingsService.updateStatus({
      bookingId: booking.id,
      status: body.status as BookingStatus,
    });

    return { data: this.mapBooking(updated) };
  }

  private ensureCanRead(
    user: AuthUser,
    booking: {
      providerUserId: string;
      customerUserId: string;
    },
  ): void {
    const subjectUserId = user.subjectUserId ?? user.userId;
    const isAdmin = user.roles.includes('admin');
    const isImpersonating = Boolean(user.actorUserId);

    if (isAdmin && !isImpersonating) {
      return;
    }

    if (user.activeRole !== 'customer' && user.activeRole !== 'provider') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    }

    if (
      user.activeRole === 'customer' &&
      booking.customerUserId !== subjectUserId
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    }

    if (
      user.activeRole === 'provider' &&
      booking.providerUserId !== subjectUserId
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    }
  }

  private ensureTransitionAllowed(params: {
    currentStatus: BookingStatus;
    nextStatus: BookingStatus;
    activeRole: AuthUser['activeRole'];
    isProviderOwner: boolean;
    isCustomerOwner: boolean;
    isImpersonating: boolean;
  }): void {
    if (params.currentStatus === params.nextStatus) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'status transition not allowed',
      });
    }

    const isOwner = params.isProviderOwner || params.isCustomerOwner;
    const roleMatchesOwner =
      (params.activeRole === 'provider' && params.isProviderOwner) ||
      (params.activeRole === 'customer' && params.isCustomerOwner);

    if (!isOwner || !roleMatchesOwner) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    }

    if (params.currentStatus === 'completed') {
      this.throwInvalidTransition();
    }

    if (params.currentStatus === 'cancelled') {
      if (params.nextStatus === 'pending' && params.isImpersonating) {
        return;
      }
      this.throwInvalidTransition();
    }

    if (params.currentStatus === 'pending') {
      if (params.nextStatus === 'cancelled') {
        return;
      }
      if (params.nextStatus === 'confirmed') {
        if (params.activeRole === 'provider') {
          return;
        }
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Forbidden',
        });
      }
      this.throwInvalidTransition();
    }

    if (params.currentStatus === 'confirmed') {
      if (params.nextStatus === 'cancelled') {
        return;
      }
      if (params.nextStatus === 'completed') {
        if (params.activeRole === 'provider') {
          return;
        }
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Forbidden',
        });
      }
      this.throwInvalidTransition();
    }

    this.throwInvalidTransition();
  }

  private throwInvalidTransition(): never {
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: 'status transition not allowed',
    });
  }

  private mapBooking(
    booking: {
      id: string;
      providerUserId: string;
      customerUserId: string;
      startTime: Date;
      endTime: Date;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      idempotencyKey: string | null;
    },
    options?: { includeIdempotencyKey?: boolean },
  ): BookingResponse {
    const response: BookingResponse = {
      id: booking.id,
      providerUserId: booking.providerUserId,
      customerUserId: booking.customerUserId,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime.toISOString(),
      status: booking.status as BookingStatus,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    };

    if (options?.includeIdempotencyKey) {
      response.idempotencyKey = booking.idempotencyKey ?? null;
    }

    return response;
  }
}
