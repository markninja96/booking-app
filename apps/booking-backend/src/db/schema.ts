import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fname: text('fname').notNull(),
    lname: text('lname').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    activeRole: text('active_role'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  }),
);

export const providerProfiles = pgTable('provider_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
  businessName: text('business_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const customerProfiles = pgTable('customer_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerUserId: uuid('provider_user_id')
      .notNull()
      .references(() => providerProfiles.userId, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => customerProfiles.userId, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    status: text('status').notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerUserIdStartTimeIdx: index(
      'bookings_provider_user_id_start_time_idx',
    ).on(table.providerUserId, table.startTime),
    customerUserIdStartTimeIdx: index(
      'bookings_customer_user_id_start_time_idx',
    ).on(table.customerUserId, table.startTime),
    providerUserIdIdempotencyKeyUnique: uniqueIndex(
      'bookings_provider_user_id_idempotency_key_unique',
    )
      .on(table.providerUserId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  }),
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    role: text('role').notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({ columns: [table.userId, table.role] }),
  }),
);

export const authIdentities = pgTable(
  'auth_identities',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    oauthProvider: text('oauth_provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    primaryKey: primaryKey({
      columns: [table.oauthProvider, table.providerUserId],
    }),
    providerUserIdUnique: uniqueIndex(
      'auth_identities_provider_provider_user_id_unique',
    ).on(table.oauthProvider, table.providerUserId),
    userIdProviderUnique: uniqueIndex(
      'auth_identities_user_id_provider_unique',
    ).on(table.userId, table.oauthProvider),
    userIdIdx: index('auth_identities_user_id_idx').on(table.userId),
  }),
);
