import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  initiativeId: string;
}

interface MetricRow {
  id: string;
  metric_type: string;
  metric_category: string;
  metric_name: string;
  baseline_value: number | null;
  baseline_unit: string | null;
  target_value: number | null;
  target_unit: string | null;
  target_date: string | null;
  measurement_method: string | null;
  reduction_pct: number | null;
  current_value: number | null;
  update_frequency: string | null;
  linked_xmatrix_kpi_id: string | null;
  is_key_result: boolean | null;
  sort_order: number | null;
}

interface ReadingRow {
  metric_id: string;
  reported_value: number;
  status_rag: string | null;
  reading_date: string;
}

function RagBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-slate-400">No readings yet</span>;
  const config =
    ({
      on_track: { label: "On Track", bg: "#16A34A" },
      at_risk: { label: "At Risk", bg: "#D97706" },
      off_track: { label: "Off Track", bg: "#DC2626" },
    } as Record<string, { label: string; bg: string }>)[status] ?? { label: status, bg: "#94A3B8" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
      style={{ backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  );
}

function categoryLabel(value: string): string {
  const map: Record<string, string> = {
    energy: "Energy",
    carbon: "Carbon / GHG",
    water: "Water",
    waste: "Waste",
    materials: "Materials",
    transport: "Transport",
    biodiversity: "Biodiversity",
    health: "Health & Wellbeing",
    social: "Social Impact",
    governance: "Governance",
    cost: "Cost Savings",
    revenue: "Revenue",
    risk: "Risk Reduction",
    process: "Process / Execution",
  };
  return map[value] ?? value;
}

function formatMonthYear(date: string | null): string {
  if (!date) return "—";
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function InitiativeMetricsTab({ initiativeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [latestReadingMap, setLatestReadingMap] = useState<Map<string, ReadingRow>>(new Map());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: metricsData }, { data: readingsData }] = await Promise.all([
        supabase
          .from("initiative_metrics")
          .select("*")
          .eq("initiative_id", initiativeId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("metric_readings")
          .select("metric_id, reported_value, status_rag, reading_date")
          .eq("initiative_id", initiativeId)
          .order("reading_date", { ascending: false }),
      ]);
      if (cancelled) return;
      const map = new Map<string, ReadingRow>();
      for (const r of (readingsData as ReadingRow[]) || []) {
        if (!map.has(r.metric_id)) map.set(r.metric_id, r);
      }
      setMetrics((metricsData as MetricRow[]) || []);
      setLatestReadingMap(map);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [initiativeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="animate-spin h-6 w-6 border-4 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  const outcomes = metrics.filter((m) => m.metric_type === "outcome_hypothesis");
  const indicators = metrics.filter((m) => m.metric_type === "leading_indicator");

  if (outcomes.length === 0 && indicators.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic py-4 text-center">
        No metrics defined yet. Add them in the LBC form — Section 8.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {outcomes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-[#1B4F72] mb-2">Impact Outcome Hypotheses</h4>
          {outcomes.map((m) => (
            <div key={m.id} className="bg-white border border-slate-200 rounded-lg p-3 mb-2">
              <div className="flex justify-between items-start">
                <span className="font-medium text-sm">{m.metric_name}</span>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {categoryLabel(m.metric_category)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-slate-500">
                <div>
                  <div>Baseline</div>
                  <div>
                    {m.baseline_value != null ? `${m.baseline_value} ${m.baseline_unit ?? ""}` : "—"}
                  </div>
                </div>
                <div>
                  <div>Target</div>
                  <div>
                    {m.target_value != null ? `${m.target_value} ${m.target_unit ?? ""}` : "—"}
                  </div>
                </div>
                <div>
                  <div>Reduction</div>
                  <div className={m.reduction_pct != null ? "text-[#0E7A65] font-medium" : ""}>
                    {m.reduction_pct != null ? `${m.reduction_pct}%` : "—"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
                <div>
                  <div>Target Date</div>
                  <div>{formatMonthYear(m.target_date)}</div>
                </div>
                <div>
                  <div>Method</div>
                  <div>{m.measurement_method ? m.measurement_method.replace(/_/g, " ") : "—"}</div>
                </div>
              </div>
              {m.linked_xmatrix_kpi_id && (
                <div className="mt-2">
                  <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">
                    {m.is_key_result ? "⭐ Key Result" : "Linked to X-Matrix KPI"}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {indicators.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-[#1B4F72] mb-2">Leading Indicators</h4>
          {indicators.map((m) => {
            const reading = latestReadingMap.get(m.id);
            return (
              <div key={m.id} className="bg-white border border-slate-200 rounded-lg p-3 mb-2">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-sm">{m.metric_name}</span>
                  <RagBadge status={reading?.status_rag ?? null} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-slate-500">
                  <div>
                    <div>Target</div>
                    <div>
                      {m.target_value != null ? `${m.target_value} ${m.target_unit ?? ""}` : "—"}
                    </div>
                  </div>
                  <div>
                    <div>Current</div>
                    <div className={m.current_value != null ? "text-slate-700 font-medium" : ""}>
                      {m.current_value != null
                        ? `${m.current_value} ${m.target_unit ?? ""}`
                        : "No readings yet"}
                    </div>
                  </div>
                  <div>
                    <div>Frequency</div>
                    <div>{m.update_frequency ? m.update_frequency.replace(/_/g, " ") : "—"}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Target Date: {formatMonthYear(m.target_date)}
                  {reading &&
                    ` · Last reading: ${new Date(
                      reading.reading_date + "T00:00:00",
                    ).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
