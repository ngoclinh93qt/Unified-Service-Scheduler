-- A vehicle cannot be serviced by two appointments at the same time, even
-- when independent bays and technicians are available. The application checks
-- this before allocation; this constraint remains the final authority for
-- concurrent requests and writes that bypass the application.
CREATE INDEX "appointments_vehicle_id_start_time_end_time_idx"
  ON "appointments"("vehicle_id", "start_time", "end_time");

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_vehicle_no_overlap"
  EXCLUDE USING gist (
    "vehicle_id" WITH =,
    tstzrange("start_time", "end_time", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED');
