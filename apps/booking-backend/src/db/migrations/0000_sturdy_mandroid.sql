CREATE TABLE IF NOT EXISTS "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_provider_id_start_time_idx" ON "bookings" USING btree ("provider_id","start_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_customer_id_start_time_idx" ON "bookings" USING btree ("customer_id","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_provider_id_idempotency_key_unique" ON "bookings" USING btree ("provider_id","idempotency_key") WHERE "bookings"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_email_unique" ON "customers" USING btree ("email");
