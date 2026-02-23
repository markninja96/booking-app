import { ApiProperty } from '@nestjs/swagger';

export class BookingDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  providerUserId!: string;

  @ApiProperty()
  customerUserId!: string;

  @ApiProperty({ example: '2030-01-01T10:00:00.000Z' })
  startTime!: string;

  @ApiProperty({ example: '2030-01-01T11:00:00.000Z' })
  endTime!: string;

  @ApiProperty({ enum: ['pending', 'confirmed', 'cancelled', 'completed'] })
  status!: string;

  @ApiProperty({ example: '2030-01-01T09:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2030-01-01T09:00:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ required: false, nullable: true })
  idempotencyKey?: string | null;
}

export class CreateBookingRequestDto {
  @ApiProperty()
  providerUserId!: string;

  @ApiProperty({ example: '2030-01-01T10:00:00.000Z' })
  startTime!: string;

  @ApiProperty({ example: '2030-01-01T11:00:00.000Z' })
  endTime!: string;

  @ApiProperty({ required: false, maxLength: 255 })
  idempotencyKey?: string;
}

export class UpdateStatusRequestDto {
  @ApiProperty({ enum: ['pending', 'confirmed', 'cancelled', 'completed'] })
  status!: string;
}

export class BookingResponseDto {
  @ApiProperty({ type: BookingDto })
  data!: BookingDto;
}

export class ListBookingsResponseDto {
  @ApiProperty({ type: [BookingDto] })
  data!: BookingDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;

  @ApiProperty()
  hasMore!: boolean;
}

export class ValidationErrorDetailDto {
  @ApiProperty()
  field!: string;

  @ApiProperty()
  message!: string;
}

export class ValidationErrorResponseDto {
  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiProperty({ type: [ValidationErrorDetailDto] })
  errors!: ValidationErrorDetailDto[];
}

export class ErrorResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  message!: string;
}
