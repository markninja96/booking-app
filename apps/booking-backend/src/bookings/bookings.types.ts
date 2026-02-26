export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type BookingResponse = {
  id: string;
  providerUserId: string;
  customerUserId: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
  idempotencyKey?: string | null;
};
