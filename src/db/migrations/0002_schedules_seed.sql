-- Add unique constraint on schedules(location_id, day_of_week) to support upsert
ALTER TABLE schedules
  ADD CONSTRAINT schedules_location_id_day_of_week_unique
  UNIQUE (location_id, day_of_week);

-- Seed initial location and schedule data
INSERT INTO locations (id, name, timezone, enabled)
VALUES
  ('surco', 'Surco', 'America/Lima', true),
  ('vmt',   'VMT',   'America/Lima', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schedules (location_id, day_of_week, start_time, end_time, appointment_duration_minutes, enabled)
VALUES
  ('surco', 0, '10:00', '13:00', 30, true),
  ('vmt',   0, '18:00', '20:00', 30, true)
ON CONFLICT (location_id, day_of_week) DO NOTHING;
