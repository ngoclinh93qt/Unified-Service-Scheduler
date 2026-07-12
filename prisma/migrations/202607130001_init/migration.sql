CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED');

CREATE TABLE "customers" (
  "id" UUID PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "phone" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "vehicles" (
  "id" UUID PRIMARY KEY,
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "vin" TEXT NOT NULL,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "vehicles_customer_id_vin_key" UNIQUE ("customer_id", "vin")
);

CREATE TABLE "dealerships" (
  "id" UUID PRIMARY KEY,
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "service_types" (
  "id" UUID PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "duration_minutes" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "service_types_duration_minutes_check" CHECK ("duration_minutes" > 0)
);

CREATE TABLE "service_bays" (
  "id" UUID PRIMARY KEY,
  "dealership_id" UUID NOT NULL REFERENCES "dealerships"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "service_bays_dealership_id_name_key" UNIQUE ("dealership_id", "name")
);

CREATE TABLE "technicians" (
  "id" UUID PRIMARY KEY,
  "dealership_id" UUID NOT NULL REFERENCES "dealerships"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "technician_qualifications" (
  "technician_id" UUID NOT NULL REFERENCES "technicians"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "service_type_id" UUID NOT NULL REFERENCES "service_types"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  PRIMARY KEY ("technician_id", "service_type_id")
);

CREATE TABLE "appointments" (
  "id" UUID PRIMARY KEY,
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "vehicle_id" UUID NOT NULL REFERENCES "vehicles"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "dealership_id" UUID NOT NULL REFERENCES "dealerships"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "service_type_id" UUID NOT NULL REFERENCES "service_types"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "service_bay_id" UUID NOT NULL REFERENCES "service_bays"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "technician_id" UUID NOT NULL REFERENCES "technicians"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "start_time" TIMESTAMPTZ(3) NOT NULL,
  "end_time" TIMESTAMPTZ(3) NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "appointments_time_range_check" CHECK ("end_time" > "start_time")
);

CREATE INDEX "appointments_dealership_id_start_time_end_time_idx"
  ON "appointments"("dealership_id", "start_time", "end_time");
CREATE INDEX "appointments_service_bay_id_start_time_end_time_idx"
  ON "appointments"("service_bay_id", "start_time", "end_time");
CREATE INDEX "appointments_technician_id_start_time_end_time_idx"
  ON "appointments"("technician_id", "start_time", "end_time");
