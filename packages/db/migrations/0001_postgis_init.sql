-- Mapistic Postgres 17 + PostGIS Schema (DDL source of truth)
-- Provision via an owner role; runtime queries should execute as a least-privilege app role.
-- Zero local auth/user tables: user_id references Dawnistic's central Better Auth user ID.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA IF NOT EXISTS mapistic;

-- 1. User Preferences & PDPA Opt-In Settings (opt_in_search_history defaults to FALSE)
CREATE TABLE IF NOT EXISTS mapistic.user_preferences (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  preferred_lang TEXT NOT NULL DEFAULT 'en' CHECK (preferred_lang IN ('en', 'ms')),
  default_travel_mode TEXT NOT NULL DEFAULT 'car' CHECK (default_travel_mode IN ('car', 'motorcycle', 'bicycle', 'walking')),
  avoid_tolls_default BOOLEAN NOT NULL DEFAULT FALSE,
  opt_in_search_history BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Saved Places
CREATE TABLE IF NOT EXISTS mapistic.saved_places (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  place_name TEXT NOT NULL,
  address TEXT NOT NULL,
  postcode TEXT,
  state TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_places_geom ON mapistic.saved_places USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_saved_places_user ON mapistic.saved_places (user_id);

-- 3. Custom Shareable Lists
CREATE TABLE IF NOT EXISTS mapistic.lists (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  places_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Opt-In Recent Searches (PDPA-compliant: only populated if opt_in_search_history = true)
CREATE TABLE IF NOT EXISTS mapistic.recent_searches (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  raw_query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Public ODbL / CDLA-Permissive-2.0 Conflated POIs
CREATE TABLE IF NOT EXISTS mapistic.osm_overture_public_pois (
  id TEXT PRIMARY KEY,
  osm_id TEXT,
  overture_id TEXT,
  license TEXT NOT NULL DEFAULT 'ODbL-1.0',
  name TEXT NOT NULL,
  name_ms TEXT,
  name_en TEXT,
  name_zh TEXT,
  name_ta TEXT,
  category TEXT NOT NULL,
  address TEXT,
  postcode TEXT,
  district TEXT,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'MY',
  provenance JSONB NOT NULL DEFAULT '[]'::jsonb,
  geom geometry(Point, 4326) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_public_pois_geom ON mapistic.osm_overture_public_pois USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_public_pois_name_trgm ON mapistic.osm_overture_public_pois USING GIN (name gin_trgm_ops);

-- 6. Custom POIs (Collective Database Separation)
CREATE TABLE IF NOT EXISTS mapistic.custom_pois (
  id BIGSERIAL PRIMARY KEY,
  submitted_by_user_id TEXT,
  license TEXT NOT NULL DEFAULT 'CC0-1.0',
  name_ms TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT NOT NULL,
  address TEXT NOT NULL,
  postcode TEXT,
  state TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_pois_geom ON mapistic.custom_pois USING GIST (geom);

-- 7. POI & Road Edit Moderation Queue
CREATE TABLE IF NOT EXISTS mapistic.poi_edits (
  id BIGSERIAL PRIMARY KEY,
  submitted_by_user_id TEXT NOT NULL,
  edit_type TEXT NOT NULL CHECK (edit_type IN ('new_poi', 'correction', 'road_closure', 'flood_alert', 'speed_limit')),
  name_ms TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT NOT NULL,
  notes TEXT NOT NULL,
  postcode TEXT,
  state TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'exported_to_osm')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_poi_edits_geom ON mapistic.poi_edits USING GIST (geom);

-- 8. Data Sources Registry
CREATE TABLE IF NOT EXISTS mapistic.data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  license TEXT NOT NULL,
  source_url TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_count INTEGER NOT NULL DEFAULT 0
);

-- 9. Route & Map Feedback
CREATE TABLE IF NOT EXISTS mapistic.feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Durable Token-Bucket Rate Limiter State
CREATE TABLE IF NOT EXISTS mapistic.rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  tokens DOUBLE PRECISION NOT NULL,
  last_refill_ms BIGINT NOT NULL
);

-- Least-privilege app role grants (execute as the database owner during provisioning)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mapistic_app') THEN
    CREATE ROLE mapistic_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA mapistic TO mapistic_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mapistic TO mapistic_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA mapistic TO mapistic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA mapistic GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mapistic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA mapistic GRANT USAGE, SELECT ON SEQUENCES TO mapistic_app;
