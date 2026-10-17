CREATE TABLE "public"."weekly_weights" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "profile" text NOT NULL,
  "weekStart" date NOT NULL,
  "weightKg" numeric NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("profile") REFERENCES "public"."profiles"("authId") ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT "weekly_weights_profile_week_key" UNIQUE ("profile", "weekStart"),
  CONSTRAINT "valid_weight" CHECK ("weightKg" > 0 AND "weightKg" < 500)
);
CREATE TRIGGER "set_public_weekly_weights_updatedAt"
BEFORE UPDATE ON "public"."weekly_weights"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updatedAt"();
