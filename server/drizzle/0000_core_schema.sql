CREATE TYPE "public"."game_event_type" AS ENUM('game_impression', 'game_click', 'game_start', 'game_30s', 'game_2min', 'game_5min', 'game_exit', 'game_replay', 'favorite', 'recommendation_impression', 'recommendation_click');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('draft', 'pending', 'published', 'offline');--> statement-breakpoint
CREATE TYPE "public"."metadata_language" AS ENUM('zh', 'en');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'paused', 'error');--> statement-breakpoint
CREATE TABLE "game_embeddings" (
	"game_id" integer PRIMARY KEY NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"content_hash" text NOT NULL,
	"model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"related_game_id" integer NOT NULL,
	"similarity" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_scores" (
	"game_id" integer PRIMARY KEY NOT NULL,
	"total_score" real DEFAULT 0 NOT NULL,
	"components" text DEFAULT '{}' NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"raw_input" text NOT NULL,
	"intent" jsonb,
	"parsed_ok" boolean DEFAULT true NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"game_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"score_detail" jsonb,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "user_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_type" "game_event_type" NOT NULL,
	"game_id" integer,
	"context" jsonb,
	"session_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"source_game_id" text NOT NULL,
	"title" text NOT NULL,
	"title_original" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"description_original" text DEFAULT '' NOT NULL,
	"description_zh" text DEFAULT '' NOT NULL,
	"thumbnail" text,
	"screenshots" text DEFAULT '[]' NOT NULL,
	"game_url" text NOT NULL,
	"developer" text,
	"publisher" text,
	"release_date" text,
	"source_updated_at" timestamp with time zone,
	"genre" text,
	"sub_genre" text,
	"tags" text DEFAULT '[]' NOT NULL,
	"mechanics" text DEFAULT '[]' NOT NULL,
	"difficulty" smallint DEFAULT 3 NOT NULL,
	"cognitive_load" smallint DEFAULT 3 NOT NULL,
	"complexity" smallint DEFAULT 3 NOT NULL,
	"pace" smallint DEFAULT 3 NOT NULL,
	"stress_level" smallint DEFAULT 3 NOT NULL,
	"replayability" smallint DEFAULT 3 NOT NULL,
	"session_length_min" integer,
	"session_length_max" integer,
	"single_player" boolean DEFAULT true NOT NULL,
	"multiplayer" boolean DEFAULT false NOT NULL,
	"min_players" integer DEFAULT 1 NOT NULL,
	"max_players" integer DEFAULT 1 NOT NULL,
	"coop" boolean DEFAULT false NOT NULL,
	"competitive" boolean DEFAULT false NOT NULL,
	"desktop" boolean DEFAULT true NOT NULL,
	"mobile" boolean DEFAULT false NOT NULL,
	"tablet" boolean DEFAULT false NOT NULL,
	"portrait" boolean DEFAULT false NOT NULL,
	"landscape" boolean DEFAULT true NOT NULL,
	"input_methods" text DEFAULT '["mouse"]' NOT NULL,
	"mood" text DEFAULT '[]' NOT NULL,
	"metadata_language" "metadata_language" DEFAULT 'zh' NOT NULL,
	"game_language" text DEFAULT 'en' NOT NULL,
	"status" "game_status" DEFAULT 'draft' NOT NULL,
	"profile_manually_edited" boolean DEFAULT false NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text,
	"api_type" text DEFAULT 'json_feed' NOT NULL,
	"status" "source_status" DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_embeddings" ADD CONSTRAINT "game_embeddings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_relations" ADD CONSTRAINT "game_relations_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_relations" ADD CONSTRAINT "game_relations_related_game_id_games_id_fk" FOREIGN KEY ("related_game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_scores" ADD CONSTRAINT "game_scores_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_results" ADD CONSTRAINT "recommendation_results_request_id_recommendation_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."recommendation_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_results" ADD CONSTRAINT "recommendation_results_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_source_id_game_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."game_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_embeddings_model_idx" ON "game_embeddings" USING btree ("model");--> statement-breakpoint
CREATE UNIQUE INDEX "game_relations_pair_uq" ON "game_relations" USING btree ("game_id","related_game_id");--> statement-breakpoint
CREATE INDEX "game_relations_game_idx" ON "game_relations" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "recommendation_requests_created_idx" ON "recommendation_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "recommendation_results_request_idx" ON "recommendation_results" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "recommendation_results_game_idx" ON "recommendation_results" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "user_events_user_idx" ON "user_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_events_game_idx" ON "user_events" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "user_events_type_idx" ON "user_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "user_events_created_idx" ON "user_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "games_source_game_uq" ON "games" USING btree ("source_id","source_game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "games_slug_uq" ON "games" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "games_genre_idx" ON "games" USING btree ("genre");--> statement-breakpoint
CREATE INDEX "games_published_at_idx" ON "games" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "games_play_count_idx" ON "games" USING btree ("play_count");--> statement-breakpoint
CREATE UNIQUE INDEX "game_sources_code_uq" ON "game_sources" USING btree ("code");