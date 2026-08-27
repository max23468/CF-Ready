CREATE TABLE performance_samples (
  id INTEGER PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  metric_id TEXT NOT NULL,
  metric_name TEXT NOT NULL CHECK (metric_name IN ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  metric_value REAL NOT NULL CHECK (metric_value >= 0),
  country_code TEXT CHECK (country_code IS NULL OR length(country_code) = 2),
  app_version TEXT NOT NULL,
  app_route TEXT NOT NULL
    CHECK (app_route IN ('home', 'rules', 'messages', 'guide', 'onboarding', 'other')),
  server_timing_json TEXT CHECK (server_timing_json IS NULL OR json_valid(server_timing_json)),
  observed_at TEXT NOT NULL,
  UNIQUE (shop_id, metric_id, metric_name)
) STRICT;

CREATE INDEX performance_samples_metric_observed_idx
  ON performance_samples(metric_name, observed_at);

CREATE INDEX performance_samples_version_route_metric_idx
  ON performance_samples(app_version, app_route, metric_name, observed_at);
