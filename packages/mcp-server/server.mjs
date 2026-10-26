#!/usr/bin/env node
/**
 * `@dawnistic/mapistic-mcp` — Standalone MCP Server for Mapistic
 *
 * Exposes 6 100%-free geospatial & transit tools to Claude Desktop, Cursor, Grok, and Tulistic:
 * - `geocode` (Bahasa Malaysia / English / Chinese / Tamil place search)
 * - `reverse_geocode` (Coordinates -> Street, Postcode, District, State)
 * - `route` (Car, Motorbike, Bicycle, Walking with Toll Avoidance & Cross-Sea detection)
 * - `search_nearby` (Find nearby POIs around a coordinate)
 * - `get_place` (Detailed place metadata + ODbL provenance)
 * - `get_transit_arrivals` (Malaysia data.gov.my GTFS RapidKL / KTMB / BAS.MY arrivals)
 */

import readline from "node:readline";

const MCP_URL = process.env.MAPISTIC_MCP_URL || "http://localhost:3000/api/mcp";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n"
    );
    return;
  }

  try {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    const data = await res.json();
    process.stdout.write(JSON.stringify(data) + "\n");
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: req.id ?? null,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Failed to reach Mapistic MCP endpoint",
        },
      }) + "\n"
    );
  }
});
