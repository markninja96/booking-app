import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { z } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(
    private readonly schema: z.ZodSchema<T>,
    private readonly location?: 'body' | 'query' | 'params',
  ) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const location = this.location ?? this.resolveLocation(metadata.type);
      const errors = result.error.issues.map((issue) => ({
        field: this.formatField(location, issue.path),
        message: issue.message,
      }));

      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors,
      });
    }

    return result.data;
  }

  private resolveLocation(type: string): 'body' | 'query' | 'params' {
    if (type === 'body') {
      return 'body';
    }
    if (type === 'query') {
      return 'query';
    }
    if (type === 'param') {
      return 'params';
    }
    return 'body';
  }

  private formatField(
    location: 'body' | 'query' | 'params',
    path: (string | number)[],
  ): string {
    const suffix = path.map(String).join('.');
    if (!suffix) {
      return location;
    }
    return `${location}.${suffix}`;
  }
}
