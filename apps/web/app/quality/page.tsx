import Link from "next/link";
import { getRegionalDataQualityMetrics } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function DataQualityDashboardPage() {
  const dq = getRegionalDataQualityMetrics();

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-4 pt-16 pb-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="solaris-badge bg-emerald-100 text-emerald-900">
            Geofabrik MY/SG/BN Extract · Overture Maps · data.gov.my GTFS
          </span>
          <h1 className="font-serif text-4xl mt-2">Malaysian Regional Data Quality Dashboard</h1>
          <p className="text-sm text-[#57534e] mt-1">
            Last Geofabrik sync: <strong>{dq.last_geofabrik_sync}</strong> · Extract size:{" "}
            <strong>{dq.pbf_extract_size_mb} MB</strong> · Compiled PMTiles:{" "}
            <strong>{dq.pmtiles_archive_size_mb} MB</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className="solaris-btn-primary text-xs">
            Open Dashboard →
          </Link>
          <Link href="/" className="solaris-btn-secondary text-xs">
            ← Back to Map
          </Link>
        </div>
      </div>

      <div className="solaris-card p-6 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#e7e5e4] text-[#57534e] uppercase">
              <th className="py-2.5">Region</th>
              <th className="py-2.5">Road Coverage (km)</th>
              <th className="py-2.5">Conflated POIs</th>
              <th className="py-2.5">Multilingual (`ms/en/zh/ta`)</th>
              <th className="py-2.5">Missing Names</th>
              <th className="py-2.5">Geocoding Hit Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e7e5e4]">
            {dq.regions.map((r) => (
              <tr key={r.region}>
                <td className="py-3 font-bold text-[#1c1917]">{r.region}</td>
                <td className="py-3 font-mono">{r.road_coverage_km.toLocaleString()} km</td>
                <td className="py-3 font-mono">{r.poi_count.toLocaleString()}</td>
                <td className="py-3 text-emerald-800 font-semibold">{r.multilingual_name_coverage_pct}%</td>
                <td className="py-3 text-amber-800">{r.missing_names_pct}%</td>
                <td className="py-3 font-bold text-emerald-900">{r.geocoding_hit_rate_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
