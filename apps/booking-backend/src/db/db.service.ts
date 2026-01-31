import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { Pool } from 'pg';
import { DB_POOL } from './drizzle';

@Injectable()
export class DbService implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
