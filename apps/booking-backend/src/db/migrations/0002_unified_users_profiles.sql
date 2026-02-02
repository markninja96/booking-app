DROP TABLE IF EXISTS "bookings";
DROP TABLE IF EXISTS "provider_profiles";
DROP TABLE IF EXISTS "customer_profiles";
DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "providers";
DROP TABLE IF EXISTS "customers";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_user_id" uuid NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_provider_user_id_provider_profiles_user_id_fk" FOREIGN KEY ("provider_user_id") REFERENCES "public"."provider_profiles"("user_id") ON DELETE restrict ON UPDATE cascade,
	CONSTRAINT "bookings_customer_user_id_customer_profiles_user_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."customer_profiles"("user_id") ON DELETE restrict ON UPDATE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_provider_user_id_start_time_idx" ON "bookings" USING btree ("provider_user_id","start_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_customer_user_id_start_time_idx" ON "bookings" USING btree ("customer_user_id","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_provider_user_id_idempotency_key_unique" ON "bookings" USING btree ("provider_user_id","idempotency_key") WHERE "bookings"."idempotency_key" is not null;
