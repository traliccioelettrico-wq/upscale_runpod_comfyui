INSERT INTO preferences (key, value) VALUES
  ('theme', '"dark"'),
  ('default_target_height', '1080'),
  ('default_interpolate', 'false'),
  ('default_fps_multiplier', '2'),
  ('polling_interval_ms', '3000')
ON CONFLICT (key) DO NOTHING;
