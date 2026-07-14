-- Temporal non-overlap is enforced by the database as the final authority,
-- independent of the application's row-locking allocation path. This protects
-- against application bugs, bypass paths, and manual writes.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_service_bay_no_overlap"
  EXCLUDE USING gist (
    "service_bay_id" WITH =,
    tstzrange("start_time", "end_time", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED');

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_technician_no_overlap"
  EXCLUDE USING gist (
    "technician_id" WITH =,
    tstzrange("start_time", "end_time", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED');
