CREATE TABLE "game_saves" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"game_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_saves" ADD CONSTRAINT "game_saves_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_saves_user_game_uq" ON "game_saves" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "game_saves_user_idx" ON "game_saves" USING btree ("user_id");