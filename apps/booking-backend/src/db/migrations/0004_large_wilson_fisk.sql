CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_id_role_unique" ON "user_roles" USING btree ("user_id","role");