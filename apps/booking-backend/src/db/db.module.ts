import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { createDrizzle, DB_POOL, DRIZZLE_DB } from './drizzle';
import { DbService } from './db.service';

@Module({
  imports: [],
  controllers: [],
  providers: [
    DbService,
    {
      provide: DB_POOL,
      useFactory: (configService: ConfigService) =>
        new Pool({
          connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        }),
      inject: [ConfigService],
    },
    {
      provide: DRIZZLE_DB,
      useFactory: (pool: Pool) => createDrizzle(pool),
      inject: [DB_POOL],
    },
  ],
  exports: [DRIZZLE_DB, DB_POOL],
})
export class DbModule {}
