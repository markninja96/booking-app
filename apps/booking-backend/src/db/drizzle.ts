import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema';

export const DB_POOL = Symbol('DB_POOL');
export const DRIZZLE_DB = Symbol('DRIZZLE_DB');

export type DbClient = NodePgDatabase<typeof schema>;

export const createDrizzle = (pool: Pool): DbClient =>
  drizzle(pool, { schema });
