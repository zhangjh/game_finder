CREATE TYPE "public"."cron_job_status" AS ENUM('enabled', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."cron_job_type" AS ENUM('sync_games', 'health_check', 'detect_duplicates');--> statement-breakpoint
CREATE TABLE "cron_job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"status" text NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"result" jsonb,
	"error" text,
	"duration_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cron_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "cron_job_type" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"schedule" text NOT NULL,
	"status" "cron_job_status" DEFAULT 'enabled' NOT NULL,
	"params" jsonb,
	"last_run_at" timestamp with time zone,
	"last_run_status" text,
	"last_run_duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cron_job_runs" ADD CONSTRAINT "cron_job_runs_job_id_cron_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."cron_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cron_job_runs_job_idx" ON "cron_job_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "cron_job_runs_started_idx" ON "cron_job_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "cron_jobs_type_idx" ON "cron_jobs" USING btree ("type");