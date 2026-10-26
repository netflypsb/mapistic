/**
 * `@dawnistic/mapistic-db` — Real Drizzle ORM Schema (`packages/db/schema.ts`)
 *
 * Implements Item #3 & #4 of the original Mapistic issue list:
 * - Uses `drizzle-orm/pg-core` (`pgSchema("mapistic")`) matching `0001_postgis_init.sql` as the DDL source of truth.
 * - Defines `saved_places`, `lists`, `recent_searches`, `custom_pois`, `poi_edits`, `data_sources`, `feedback`,
 *   plus `user_preferences`, `osm_overture_public_pois`, and `rate_limit_buckets`.
 * - Includes custom PostGIS `geometry(Point, 4326)` column type and GIST index definitions.
 * - Does NOT define a second auth provider or user table (users are resolved via Dawnistic's central Better Auth session).
 */

import {
  pgSchema,
  bigserial,
  text,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  timestamp,
  customType,
  index,
} from "drizzle-orm/pg-core";

export interface DawnisticSessionUser {
  id: string;
  email: string;
  name?: string | null;
}

export const mapisticSchema = pgSchema("mapistic");

/** Custom PostGIS `geometry(Point, 4326)` type for Drizzle ORM */
export const geometryPoint4326 = customType<{
  data: { lat: number; lon: number } | string;
  driverData: string;
}>({
  dataType() {
    return "geometry(Point, 4326)";
  },
  toDriver(value) {
    if (typeof value === "string") return value;
    return `SRID=4326;POINT(${Number(value.lon)} ${Number(value.lat)})`;
  },
  fromDriver(value: string) {
    return value;
  },
});

// 1. User Preferences & PDPA Opt-In Settings (keyed by Dawnistic Hub user_id)
export const userPreferences = mapisticSchema.table("user_preferences", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  preferredLang: text("preferred_lang").notNull().default("en"),
  defaultTravelMode: text("default_travel_mode").notNull().default("car"),
  avoidTollsDefault: boolean("avoid_tolls_default").notNull().default(false),
  optInSearchHistory: boolean("opt_in_search_history").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 2. Saved Places (`mapistic.saved_places`)
export const savedPlaces = mapisticSchema.table(
  "saved_places",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull(),
    label: text("label").notNull(),
    placeName: text("place_name").notNull(),
    address: text("address").notNull(),
    postcode: text("postcode"),
    state: text("state"),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    geom: geometryPoint4326("geom").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    geomIdx: index("idx_saved_places_geom").using("gist", table.geom),
    userIdx: index("idx_saved_places_user").on(table.userId),
  })
);

// 3. Lists (`mapistic.lists`)
export const lists = mapisticSchema.table("lists", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  isPublic: boolean("is_public").notNull().default(true),
  placesJson: jsonb("places_json")
    .$type<Array<{ name: string; state: string; lat: number; lon: number }>>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 4. Opt-In Recent Searches (`mapistic.recent_searches`) — PDPA default OFF
export const recentSearches = mapisticSchema.table("recent_searches", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  rawQuery: text("raw_query").notNull(),
  normalizedQuery: text("normalized_query").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 5. Public ODbL / CDLA-Permissive-2.0 Conflated POIs (`mapistic.osm_overture_public_pois`)
export const osmOverturePublicPois = mapisticSchema.table(
  "osm_overture_public_pois",
  {
    id: text("id").primaryKey(),
    osmId: text("osm_id"),
    overtureId: text("overture_id"),
    license: text("license").notNull().default("ODbL-1.0"),
    name: text("name").notNull(),
    nameMs: text("name_ms"),
    nameEn: text("name_en"),
    nameZh: text("name_zh"),
    nameTa: text("name_ta"),
    category: text("category").notNull(),
    address: text("address"),
    postcode: text("postcode"),
    district: text("district"),
    state: text("state"),
    country: text("country").notNull().default("MY"),
    provenance: jsonb("provenance").$type<string[]>().notNull().default([]),
    geom: geometryPoint4326("geom").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    geomIdx: index("idx_public_pois_geom").using("gist", table.geom),
  })
);

// 6. Custom POIs (`mapistic.custom_pois`) — Collective Database Separation
export const customPois = mapisticSchema.table(
  "custom_pois",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    submittedByUserId: text("submitted_by_user_id"),
    license: text("license").notNull().default("CC0-1.0"),
    nameMs: text("name_ms").notNull(),
    nameEn: text("name_en").notNull(),
    category: text("category").notNull(),
    address: text("address").notNull(),
    postcode: text("postcode"),
    state: text("state").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    geom: geometryPoint4326("geom").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    geomIdx: index("idx_custom_pois_geom").using("gist", table.geom),
  })
);

// 7. POI & Road Edits Moderation Queue (`mapistic.poi_edits`)
export const poiEdits = mapisticSchema.table(
  "poi_edits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    submittedByUserId: text("submitted_by_user_id").notNull(),
    editType: text("edit_type").notNull(),
    nameMs: text("name_ms").notNull(),
    nameEn: text("name_en").notNull(),
    category: text("category").notNull(),
    notes: text("notes").notNull(),
    postcode: text("postcode"),
    state: text("state"),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    geom: geometryPoint4326("geom").notNull(),
    moderationStatus: text("moderation_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    geomIdx: index("idx_poi_edits_geom").using("gist", table.geom),
  })
);

// 8. Data Sources Registry (`mapistic.data_sources`)
export const dataSources = mapisticSchema.table("data_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  license: text("license").notNull(),
  sourceUrl: text("source_url").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  recordCount: integer("record_count").notNull().default(0),
});

// 9. Feedback (`mapistic.feedback`)
export const feedback = mapisticSchema.table("feedback", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id"),
  category: text("category").notNull(),
  message: text("message").notNull(),
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 10. Durable Token-Bucket Rate Limiter Table (`mapistic.rate_limit_buckets`)
export const rateLimitBuckets = mapisticSchema.table("rate_limit_buckets", {
  bucketKey: text("bucket_key").primaryKey(),
  tokens: doublePrecision("tokens").notNull(),
  lastRefillMs: bigserial("last_refill_ms", { mode: "number" }).notNull(),
});

export const schema = {
  userPreferences,
  savedPlaces,
  lists,
  recentSearches,
  osmOverturePublicPois,
  customPois,
  poiEdits,
  dataSources,
  feedback,
  rateLimitBuckets,
};
