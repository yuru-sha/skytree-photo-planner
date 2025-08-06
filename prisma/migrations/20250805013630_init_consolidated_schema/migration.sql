-- CreateEnum
CREATE TYPE "public"."LocationStatus" AS ENUM ('active', 'restricted');

-- CreateEnum
CREATE TYPE "public"."AdminRole" AS ENUM ('admin', 'super');

-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('diamond_sunrise', 'diamond_sunset', 'pearl_moonrise', 'pearl_moonset');

-- CreateEnum
CREATE TYPE "public"."AccuracyLevel" AS ENUM ('perfect', 'excellent', 'good', 'fair');

-- CreateEnum
CREATE TYPE "public"."SettingType" AS ENUM ('string', 'number', 'boolean');

-- CreateTable
CREATE TABLE "public"."admins" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "public"."AdminRole" NOT NULL DEFAULT 'admin',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refresh_tokens" (
    "id" SERIAL NOT NULL,
    "token" VARCHAR(1000) NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."locations" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "elevation" DOUBLE PRECISION,
    "distance_to_skytree" DOUBLE PRECISION NOT NULL,
    "azimuth_to_skytree" DOUBLE PRECISION NOT NULL,
    "elevation_to_skytree" DOUBLE PRECISION NOT NULL,
    "access_info" TEXT,
    "parking_info" TEXT,
    "prefecture" VARCHAR(20) NOT NULL,
    "status" "public"."LocationStatus" NOT NULL DEFAULT 'active',
    "measurement_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."location_events" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "event_date" DATE NOT NULL,
    "event_time" TIMESTAMPTZ(6) NOT NULL,
    "azimuth" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION NOT NULL,
    "quality_score" DOUBLE PRECISION NOT NULL,
    "moon_phase" DOUBLE PRECISION,
    "moon_illumination" DOUBLE PRECISION,
    "calculation_year" INTEGER NOT NULL,
    "event_type" "public"."EventType" NOT NULL,
    "accuracy" "public"."AccuracyLevel",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_settings" (
    "id" SERIAL NOT NULL,
    "setting_key" VARCHAR(100) NOT NULL,
    "setting_type" "public"."SettingType" NOT NULL,
    "number_value" DOUBLE PRECISION,
    "string_value" TEXT,
    "boolean_value" BOOLEAN,
    "description" TEXT,
    "category" VARCHAR(50) NOT NULL,
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_username_key" ON "public"."admins"("username");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "public"."admins"("email");

-- CreateIndex
CREATE INDEX "admins_username_idx" ON "public"."admins"("username");

-- CreateIndex
CREATE INDEX "admins_email_idx" ON "public"."admins"("email");

-- CreateIndex
CREATE INDEX "admins_is_active_idx" ON "public"."admins"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "public"."refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "public"."refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_admin_id_idx" ON "public"."refresh_tokens"("admin_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "public"."refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_is_revoked_idx" ON "public"."refresh_tokens"("is_revoked");

-- CreateIndex
CREATE INDEX "locations_name_idx" ON "public"."locations"("name");

-- CreateIndex
CREATE INDEX "locations_distance_to_skytree_idx" ON "public"."locations"("distance_to_skytree");

-- CreateIndex
CREATE INDEX "locations_status_idx" ON "public"."locations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "locations_latitude_longitude_key" ON "public"."locations"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "location_events_location_id_idx" ON "public"."location_events"("location_id");

-- CreateIndex
CREATE INDEX "location_events_event_date_idx" ON "public"."location_events"("event_date");

-- CreateIndex
CREATE INDEX "location_events_calculation_year_idx" ON "public"."location_events"("calculation_year");

-- CreateIndex
CREATE INDEX "location_events_event_type_idx" ON "public"."location_events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "location_events_location_id_event_date_event_type_key" ON "public"."location_events"("location_id", "event_date", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_setting_key_key" ON "public"."system_settings"("setting_key");

-- CreateIndex
CREATE INDEX "system_settings_setting_key_idx" ON "public"."system_settings"("setting_key");

-- CreateIndex
CREATE INDEX "system_settings_category_idx" ON "public"."system_settings"("category");

-- AddForeignKey
ALTER TABLE "public"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."location_events" ADD CONSTRAINT "location_events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
