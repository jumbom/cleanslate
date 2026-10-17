CREATE TABLE "public"."strategies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "profile" text NOT NULL,
  "name" text NOT NULL,
  "startDate" date NOT NULL,
  "endDate" date,
  "planNote" text,
  "grade" integer,
  "reviewNote" text,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("profile") REFERENCES "public"."profiles"("authId") ON UPDATE cascade ON DELETE cascade,
  CONSTRAINT "valid_grade" CHECK (grade IS NULL OR (grade >= 1 AND grade <= 5)),
  CONSTRAINT "valid_period" CHECK ("endDate" IS NULL OR "endDate" >= "startDate")
);
CREATE INDEX "strategies_profile_start" ON "public"."strategies" ("profile", "startDate");
CREATE TRIGGER "set_public_strategies_updatedAt"
BEFORE UPDATE ON "public"."strategies"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updatedAt"();
