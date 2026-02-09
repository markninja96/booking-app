ALTER TABLE "auth_identities" RENAME COLUMN "provider" TO "oauth_provider";
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_oauth_provider_provider_user_id_pk" PRIMARY KEY("oauth_provider","provider_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_user_id_provider_unique" ON "auth_identities" USING btree ("user_id","oauth_provider");
--> statement-breakpoint
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities" USING btree ("user_id");
