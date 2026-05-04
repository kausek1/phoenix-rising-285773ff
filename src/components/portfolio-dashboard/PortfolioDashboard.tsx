import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FLOW_STAGES,
  loadFlowHealth,
  classifyRYG,
  RYG_COLOR,
  RYG_LABEL,
  type FlowStage,
  type StageStat,
  type ThresholdRow,
} from "@/lib/flow-health";

interface ActivePI {
  id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
}

function fmtRange(s?: string | null, e?: string | null) {
  if (!s || !e) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${new Date(s).toLocaleDateString(undefined, opts)} – ${new Date(e).toLocaleDateString(undefined, opts)}`;
}

export default function PortfolioDashboard() {
  const { clientId } = useAuth();
  const [pi, setPi] = useState<ActivePI | null>(null);
  const [stats, setStats] = useState<Record<FlowStage, StageStat> | null>(null);
  const [thresholds, setThresholds] = useState<Record<FlowStage, ThresholdRow> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Try fetching with date columns; fall back if absent.
      let activePi: ActivePI | null = null;
      const { data: piRows } = await supabase
        .from("planning_increments")
        .select("id, name, start_date, end_date")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .limit(1);
      if (piRows && piRows.length > 0) {
        activePi = piRows[0] as ActivePI;
      } else {
        // fallback to status='active' (existing convention)
        const { data: alt } = await supabase
          .from("planning_increments")
          .select("id, name, start_date, end_date")
          .eq("client_id", clientId)
          .eq("status", "active")
          .limit(1);
        activePi = (alt?.[0] as ActivePI) ?? null;
      }
      if (cancelled) return;
      setPi(activePi);

      const piWindow =
        activePi?.start_date && activePi?.end_date
          ? { start: new Date(activePi.start_date), end: new Date(activePi.end_date) }
          : null;
      const { stats, thresholds } = await loadFlowHealth(clientId, piWindow);
      if (cancelled) return;
      setStats(stats);
      setThresholds(thresholds);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const rangeLabel = pi ? fmtRange(pi.start_date, pi.end_date) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-primary">Portfolio Dashboard</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {pi ? (
            <>
              <span className="font-medium text-foreground">{pi.name}</span>
              {rangeLabel && <Badge variant="outline">{rangeLabel}</Badge>}
            </>
          ) : (
            <span className="italic">No active planning increment</span>
          )}
        </div>
      </div>

      {/* Panel 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Portfolio Flow Health — Avg Days in State</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !stats || !thresholds ? (
            <p className="text-muted-foreground text-sm">Loading flow health…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {FLOW_STAGES.map(({ key, label }) => {
                const s = stats[key];
                const t = thresholds[key];
                const ryg = classifyRYG(s.avgDaysCurrent, t);
                return (
                  <div key={key} className="rounded-lg border bg-card p-4 flex flex-col gap-2">
                    <div className="text-sm font-medium text-muted-foreground">{label}</div>
                    {s.avgDaysCurrent == null ? (
                      <div className="text-2xl font-semibold text-muted-foreground">No data yet</div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold text-primary">
                          {s.avgDaysCurrent.toFixed(1)}
                          <span className="text-xs font-normal text-muted-foreground ml-1">days</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          4-Q rolling: {s.avgDaysRolling != null ? `${s.avgDaysRolling.toFixed(1)}d` : "—"}
                        </div>
                        {ryg !== "none" && (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ background: RYG_COLOR[ryg] }}
                            />
                            <span className="text-xs font-medium" style={{ color: RYG_COLOR[ryg] }}>
                              {RYG_LABEL[ryg]}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-auto">
                      n = {s.sampleSizeCurrent} initiatives
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Panel 2 placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Panel 2</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground italic text-sm">Coming Soon</p>
        </CardContent>
      </Card>

      {/* Panel 3 placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Panel 3</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground italic text-sm">Coming Soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
