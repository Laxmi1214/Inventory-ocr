ALTER TABLE "users" RENAME COLUMN "full_name" TO "username";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password" text NOT NULL;