-- Custom SQL migration file, put your code below! --
ALTER TABLE "users" RENAME COLUMN "name" TO "fname";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lname" text;
--> statement-breakpoint
UPDATE "users" SET "lname" = '' WHERE "lname" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "lname" SET NOT NULL;
