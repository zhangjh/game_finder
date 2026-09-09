CREATE TYPE "public"."game_feedback_status" AS ENUM('pending', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."game_feedback_type" AS ENUM('not_playable', 'wrong_language');--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'embedding_games'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'cron_job_type')
  ) THEN
    ALTER TYPE "public"."cron_job_type" ADD VALUE 'embedding_games';
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "game_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"feedback_type" "game_feedback_type" NOT NULL,
	"status" "game_feedback_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_feedback" ADD CONSTRAINT "game_feedback_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_feedback_status_idx" ON "game_feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "game_feedback_game_idx" ON "game_feedback" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_feedback_created_idx" ON "game_feedback" USING btree ("created_at");