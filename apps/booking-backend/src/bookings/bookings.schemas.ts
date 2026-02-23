import { z } from 'zod';

const ISO_WITH_TIMEZONE_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const isIsoWithTimezone = (value: string): boolean => {
  if (!ISO_WITH_TIMEZONE_REGEX.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const addMonths = (date: Date, months: number): Date => {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
};

const validateCursorToken = (value: string): boolean => {
  try {
    const normalized = value.trim();
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    const reencoded = Buffer.from(decoded, 'utf8')
      .toString('base64')
      .replace(/=+$/u, '');
    const normalizedNoPad = normalized.replace(/=+$/u, '');
    if (reencoded !== normalizedNoPad) {
      return false;
    }
    const [startTime, id] = decoded.split('|');
    if (!startTime || !id) {
      return false;
    }
    return (
      isIsoWithTimezone(startTime) && z.string().uuid().safeParse(id).success
    );
  } catch {
    return false;
  }
};

export const bookingIdParamSchema = z.object({
  id: z.string().uuid({ message: 'id must be a valid UUID' }),
});

export const createBookingSchema = z
  .object({
    providerUserId: z
      .string()
      .uuid({ message: 'providerUserId must be a valid UUID' }),
    startTime: z.string().refine(isIsoWithTimezone, {
      message: 'startTime must be a valid ISO 8601 timestamp with timezone',
    }),
    endTime: z.string().refine(isIsoWithTimezone, {
      message: 'endTime must be a valid ISO 8601 timestamp with timezone',
    }),
    idempotencyKey: z
      .string()
      .min(1, { message: 'idempotencyKey must be a non-empty string' })
      .max(255, { message: 'idempotencyKey must be at most 255 characters' })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return;
    }

    const now = new Date();
    if (start <= now) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startTime must be in the future',
        path: ['startTime'],
      });
    } else {
      const minStart = new Date(now.getTime() + 5 * 60 * 1000);
      if (start < minStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'startTime must be at least 5 minutes from now',
          path: ['startTime'],
        });
      }
    }

    const maxStart = addMonths(now, 6);
    if (start > maxStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startTime must be within 6 months',
        path: ['startTime'],
      });
    }

    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endTime must be after startTime',
        path: ['endTime'],
      });
    }

    const durationMs = end.getTime() - start.getTime();
    const maxDurationMs = 8 * 60 * 60 * 1000;
    if (durationMs > maxDurationMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'duration must be no more than 8 hours',
        path: ['endTime'],
      });
    }
  });

export const updateStatusSchema = z.object({
  status: z.enum(['pending', 'cancelled', 'confirmed', 'completed'], {
    errorMap: () => ({
      message:
        'status must be one of: pending, confirmed, cancelled, completed',
    }),
  }),
});

export const listBookingsSchema = z.object({
  cursor: z
    .string()
    .optional()
    .refine((value) => !value || validateCursorToken(value), {
      message: 'cursor must be a valid base64 token',
    }),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  providerUserId: z
    .string()
    .uuid({ message: 'providerUserId must be a valid UUID' })
    .optional(),
  customerUserId: z
    .string()
    .uuid({ message: 'customerUserId must be a valid UUID' })
    .optional(),
  status: z
    .enum(['pending', 'confirmed', 'cancelled', 'completed'], {
      errorMap: () => ({
        message:
          'status must be one of: pending, confirmed, cancelled, completed',
      }),
    })
    .optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListBookingsInput = z.infer<typeof listBookingsSchema>;
export type BookingIdParam = z.infer<typeof bookingIdParamSchema>;
