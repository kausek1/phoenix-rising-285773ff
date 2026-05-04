import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
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
import {
  loadInitiativeDeliveryStatus,
  RAG_BG,
  fmtDate,
  type InitiativeRow,
  type InitiativeStatus,
} from "@/lib/portfolio-status";
import Panel3XMatrix from "./Panel3XMatrix";

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

function StatusBadge({
  rag,
  label,
  showAuto,
  warn,
  tooltip,
}: {
  rag: keyof typeof RAG_BG;
  label: string;
  showAuto?: boolean;
  warn?: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        title={tooltip}
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
        style={{ backgroundColor: RAG_BG[rag] }}
      >
        {label}
      </span>
      {showAuto && (
        <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
          auto
        </span>
      )}
      {warn && (
        <span
          title={warn}
          className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
        >
          <AlertTriangle className="h-3 w-3" /> {warn}
        </span>
      )}
    </div>
  );
}

export default function PortfolioDashboard() {
  const { clientId } = useAuth();
  const [pi, setPi] = useState<ActivePI | null>(null);
  const [stats, setStats] = useState<Record<FlowStage, StageStat> | null>(null);
  const [thresholds, setThresholds] = useState<Record<FlowStage, ThresholdRow> | null>(null);
  const [loading, setLoading] = useState(true);

  // Panel 2
  const [initiatives, setInitiatives] = useState<InitiativeRow[]>([]);
  const [lbcNumbers, setLbcNumbers] = useState<Record<string, number>>({});
  const [statuses, setStatuses] = useState<Record<string, InitiativeStatus>>({});
  const [p2Loading, setP2Loading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
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

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setP2Loading(true);
      const { initiatives, lbcNumbers, statuses } = await loadInitiativeDeliveryStatus(clientId);
      if (cancelled) return;
      setInitiatives(initiatives);
      setLbcNumbers(lbcNumbers);
      setStatuses(statuses);
      setP2Loading(false);
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

      {/* Panel 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Initiative Delivery Status</CardTitle>
          <CardDescription>In Delivery and Deployed initiatives only</CardDescription>
        </CardHeader>
        <CardContent>
          {p2Loading ? (
            <p className="text-muted-foreground text-sm">Loading delivery status…</p>
          ) : initiatives.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">
              No initiatives currently In Delivery or Deployed.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Initiative</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initiatives.map((i) => {
                  const st = statuses[i.id];
                  const stagePill =
                    i.stage === "deployed" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white bg-[#16A34A]">
                        Deployed
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white bg-teal-600">
                        In Delivery
                      </span>
                    );
                  return (
                    <TableRow key={i.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {lbcNumbers[i.id] != null && (
                            <Badge variant="outline" className="font-mono">
                              LBC-{String(lbcNumbers[i.id]).padStart(3, "0")}
                            </Badge>
                          )}
                          <span className="font-medium">{i.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>{stagePill}</TableCell>
                      <TableCell>
                        {st && <StatusBadge rag={st.schedule.rag} label={st.schedule.label} />}
                      </TableCell>
                      <TableCell>
                        {st && (
                          <StatusBadge rag={st.cost.rag} label={st.cost.label} warn={st.cost.warn} />
                        )}
                      </TableCell>
                      <TableCell>
                        {st && <StatusBadge rag={st.impact.rag} label={st.impact.label} showAuto />}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(st?.last_updated ?? null)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Panel 3 */}
      <Panel3XMatrix />
    </div>
  );
}
