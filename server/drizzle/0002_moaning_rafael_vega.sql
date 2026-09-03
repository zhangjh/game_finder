CREATE TABLE "suspected_duplicates" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"duplicate_of_game_id" integer NOT NULL,
	"similarity" real NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "health_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "health_fail_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suspected_duplicates" ADD CONSTRAINT "suspected_duplicates_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspected_duplicates" ADD CONSTRAINT "suspected_duplicates_duplicate_of_game_id_games_id_fk" FOREIGN KEY ("duplicate_of_game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suspected_dup_pair_uq" ON "suspected_duplicates" USING btree ("game_id","duplicate_of_game_id");--> statement-breakpoint
CREATE INDEX "suspected_dup_status_idx" ON "suspected_duplicates" USING btree ("status");