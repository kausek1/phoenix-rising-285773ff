import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Objective { id: string; title: string; sort_order: number | null; }
interface Priority { id: string; title: string; sort_order: number | null; }
interface KPI {
  id: string; name: string; unit: string | null; sort_order: number | null;
  current_value: number | null;
  dashboard_comment: string | null;
  comment_updated_at: string | null;
  comment_updated_by: string | null;
}
interface MetricRow { id: string; linked_xmatrix_kpi_id: string; target_unit: string | null; }
interface ReadingRow { metric_id: string; reported_value: number | null; status_rag: string | null; reading_date: string; }

interface KPIRow {
  kpi: KPI;
  achievement: {
    kind: "metric" | "manual" | "none";
    value: number | null;
    unit: string | null;
    rag: string | null;
  };
}
interface PriorityRow { priority: Priority; kpis: KPIRow[]; }
interface ObjectiveRow { objective: Objective; priorities: PriorityRow[]; rowCount: number; }

const RAG_DOT: Record<string, string> = {
  on_track: "#16A34A",
  at_risk: "#D97706",
  off_track: "#DC2626",
};
const RAG_LABEL: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
};

function fmtUpdated(iso: string | null, name: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const first = name ? name.split(/\s+/)[0] : "user";
  return `Updated ${dateStr} by ${first}`;
}

function CommentCell({
  kpi, profileName, canEdit, onSaved,
}: {
  kpi: KPI;
  profileName: string | null;
  canEdit: boolean;
  onSaved: (next: KPI) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(kpi.dashboard_comment ?? "");
  const [saving, setSaving] = useState(false);
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  useEffect(() => { setValue(kpi.dashboard_comment ?? ""); }, [kpi.dashboard_comment]);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload: any = {
        dashboard_comment: value.trim() || null,
        comment_updated_at: new Date().toISOString(),
        comment_updated_by: userId,
      };
      const { data, error } = await supabase
        .from("xmatrix_kpis")
        .update(payload)
        .eq("id", kpi.id)
        .select("id, name, unit, sort_order, current_value, dashboard_comment, comment_updated_at, comment_updated_by")
        .single();
      if (error) throw error;
      onSaved(data as KPI);
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save comment");
    } finally {
      setSaving(false);
    }
  }, [kpi.id, onSaved, saving, userId, value]);

  const updated = fmtUpdated(kpi.comment_updated_at, profileName);

  if (!canEdit) {
    return (
      <div className="text-sm">
        {kpi.dashboard_comment ? (
          <p className="whitespace-pre-wrap">{kpi.dashboard_comment}</p>
        ) : (
          <span className="text-muted-foreground italic">—</span>
        )}
        {updated && <p className="text-[11px] text-muted-foreground mt-1">{updated}</p>}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <Textarea
          autoFocus
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape") {
              setValue(kpi.dashboard_comment ?? "");
              setEditing(false);
            }
          }}
          disabled={saving}
          className="min-h-[3rem] text-sm"
        />
        {updated && <p className="text-[11px] text-muted-foreground">{updated}</p>}
      </div>
    );
  }

  return (
    <div
      className="cursor-text rounded hover:bg-muted/50 p-1 -m-1 text-sm"
      onClick={() => setEditing(true)}
    >
      {kpi.dashboard_comment ? (
        <p className="whitespace-pre-wrap">{kpi.dashboard_comment}</p>
      ) : (
        <span className="text-muted-foreground italic">Add comment...</span>
      )}
      {updated && <p className="text-[11px] text-muted-foreground mt-1">{updated}</p>}
    </div>
  );
}

export default function Panel3XMatrix() {
  const { clientId, role, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [tree, setTree] = useState<ObjectiveRow[]>([]);
  const [profileName, setProfileName] = useState<string | null>(null);
  const fiscalYear = new Date().getFullYear();
  const canEdit = role === "admin" || role === "contributor";

  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", session.user.id).maybeSingle();
      setProfileName((data as any)?.full_name ?? null);
    })();
  }, [session?.user?.id]);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      // 1. objectives
      const { data: objs, error: oErr } = await supabase
        .from("xmatrix_annual_objectives")
        .select("id, title, sort_order")
        .eq("client_id", clientId)
        .eq("fiscal_year", fiscalYear)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (oErr) throw oErr;
      const objList = (objs ?? []) as Objective[];
      setObjectives(objList);
      if (objList.length === 0) { setTree([]); return; }

      const objIds = objList.map((o) => o.id);

      // 2. obj→priority correlations (strong)
      const { data: opc } = await supabase
        .from("xmatrix_objective_priority_correlations")
        .select("objective_id, priority_id, strength")
        .eq("client_id", clientId)
        .eq("strength", "strong")
        .in("objective_id", objIds);
      const opcRows = (opc ?? []) as Array<{ objective_id: string; priority_id: string }>;
      const priIds = Array.from(new Set(opcRows.map((r) => r.priority_id)));
      if (priIds.length === 0) { setTree([]); return; }

      const { data: priData } = await supabase
        .from("xmatrix_improvement_priorities")
        .select("id, title, sort_order")
        .eq("client_id", clientId)
        .in("id", priIds)
        .order("sort_order", { ascending: true });
      const priMap = new Map<string, Priority>();
      for (const p of (priData ?? []) as Priority[]) priMap.set(p.id, p);

      // 3. priority→kpi correlations (strong)
      const { data: pkc } = await supabase
        .from("xmatrix_priority_kpi_correlations")
        .select("priority_id, kpi_id, strength")
        .eq("client_id", clientId)
        .eq("strength", "strong")
        .in("priority_id", priIds);
      const pkcRows = (pkc ?? []) as Array<{ priority_id: string; kpi_id: string }>;
      const kpiIds = Array.from(new Set(pkcRows.map((r) => r.kpi_id)));
      if (kpiIds.length === 0) { setTree([]); return; }

      const { data: kpiData } = await supabase
        .from("xmatrix_kpis")
        .select("id, name, unit, sort_order, current_value, dashboard_comment, comment_updated_at, comment_updated_by")
        .eq("client_id", clientId)
        .in("id", kpiIds)
        .order("sort_order", { ascending: true });
      const kpiMap = new Map<string, KPI>();
      for (const k of (kpiData ?? []) as KPI[]) kpiMap.set(k.id, k);

      // 4. metrics + readings
      const { data: metrics } = await supabase
        .from("initiative_metrics")
        .select("id, linked_xmatrix_kpi_id, target_unit")
        .eq("client_id", clientId)
        .eq("metric_type", "outcome_hypothesis")
        .in("linked_xmatrix_kpi_id", kpiIds);
      const metricsByKpi = new Map<string, MetricRow>();
      for (const m of (metrics ?? []) as MetricRow[]) {
        if (m.linked_xmatrix_kpi_id) metricsByKpi.set(m.linked_xmatrix_kpi_id, m);
      }
      const metricIds = Array.from(metricsByKpi.values()).map((m) => m.id);
      const latestByMetric = new Map<string, ReadingRow>();
      if (metricIds.length > 0) {
        const { data: readings } = await supabase
          .from("metric_readings")
          .select("metric_id, reported_value, status_rag, reading_date")
          .in("metric_id", metricIds)
          .order("reading_date", { ascending: false });
        for (const r of (readings ?? []) as ReadingRow[]) {
          if (!latestByMetric.has(r.metric_id)) latestByMetric.set(r.metric_id, r);
        }
      }

      // Build tree
      const built: ObjectiveRow[] = [];
      for (const obj of objList) {
        const pris = opcRows.filter((r) => r.objective_id === obj.id).map((r) => priMap.get(r.priority_id)).filter(Boolean) as Priority[];
        pris.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const priorityRows: PriorityRow[] = [];
        for (const pri of pris) {
          const kpis = pkcRows.filter((r) => r.priority_id === pri.id).map((r) => kpiMap.get(r.kpi_id)).filter(Boolean) as KPI[];
          kpis.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const kpiRows: KPIRow[] = kpis.map((kpi) => {
            const m = metricsByKpi.get(kpi.id);
            const reading = m ? latestByMetric.get(m.id) : null;
            if (m && reading && reading.reported_value != null) {
              return {
                kpi,
                achievement: {
                  kind: "metric",
                  value: Number(reading.reported_value),
                  unit: m.target_unit ?? kpi.unit,
                  rag: reading.status_rag,
                },
              };
            }
            if (kpi.current_value != null) {
              return {
                kpi,
                achievement: { kind: "manual", value: Number(kpi.current_value), unit: kpi.unit, rag: null },
              };
            }
            return { kpi, achievement: { kind: "none", value: null, unit: kpi.unit, rag: null } };
          });
          if (kpiRows.length > 0) priorityRows.push({ priority: pri, kpis: kpiRows });
        }
        if (priorityRows.length > 0) {
          const rowCount = priorityRows.reduce((acc, p) => acc + p.kpis.length, 0);
          built.push({ objective: obj, priorities: priorityRows, rowCount });
        }
      }
      setTree(built);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load X-Matrix deployment");
    } finally {
      setLoading(false);
    }
  }, [clientId, fiscalYear]);

  useEffect(() => { void load(); }, [load]);

  const updateKpiInTree = useCallback((next: KPI) => {
    setTree((prev) => prev.map((o) => ({
      ...o,
      priorities: o.priorities.map((p) => ({
        ...p,
        kpis: p.kpis.map((k) => k.kpi.id === next.id ? { ...k, kpi: { ...k.kpi, ...next } } : k),
      })),
    })));
  }, []);

  const hasObjectives = objectives.length > 0;
  const hasRows = tree.length > 0;

  const totalRows = useMemo(() => tree.reduce((a, o) => a + o.rowCount, 0), [tree]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Annual Business Plan Deployment</CardTitle>
        <CardDescription>Strategy-to-execution traceability — {fiscalYear} X-Matrix</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading X-Matrix deployment…</p>
        ) : !hasObjectives ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              No X-Matrix objectives found for {fiscalYear}. Complete the X-Matrix to populate this view.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/xmatrix">Open X-Matrix</Link>
            </Button>
          </div>
        ) : !hasRows ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              Objectives found but no strongly-linked Improvement Priorities or KPIs. Update correlations in the X-Matrix.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/xmatrix">Open X-Matrix</Link>
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">Annual Objective</TableHead>
                  <TableHead className="w-[20%]">Improvement Priority</TableHead>
                  <TableHead className="w-[20%]">KPI</TableHead>
                  <TableHead className="w-[15%]">Current Achievement</TableHead>
                  <TableHead className="w-[25%]">Comments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tree.map((o) => {
                  const objBg = "#EFF6FF";
                  const rows: React.ReactNode[] = [];
                  let firstObjRow = true;
                  for (const p of o.priorities) {
                    let firstPriRow = true;
                    for (const k of p.kpis) {
                      rows.push(
                        <TableRow key={`${o.objective.id}-${p.priority.id}-${k.kpi.id}`} style={{ backgroundColor: objBg }}>
                          {firstObjRow && (
                            <TableCell rowSpan={o.rowCount} className="align-top font-bold" style={{ backgroundColor: objBg }}>
                              {o.objective.title}
                            </TableCell>
                          )}
                          {firstPriRow && (
                            <TableCell rowSpan={p.kpis.length} className="align-top" style={{ backgroundColor: objBg }}>
                              {p.priority.title}
                            </TableCell>
                          )}
                          <TableCell className="align-top">
                            <div className="font-medium text-sm">{k.kpi.name}</div>
                            {k.kpi.unit && (
                              <div className="text-xs text-muted-foreground">{k.kpi.unit}</div>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            {k.achievement.kind === "none" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <div className="space-y-1">
                                <div className="text-sm font-medium">
                                  {k.achievement.value}
                                  {k.achievement.unit && <span className="text-muted-foreground ml-1">{k.achievement.unit}</span>}
                                </div>
                                {k.achievement.kind === "metric" && k.achievement.rag && RAG_DOT[k.achievement.rag] && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: RAG_DOT[k.achievement.rag] }} />
                                    <span className="text-xs" style={{ color: RAG_DOT[k.achievement.rag] }}>
                                      {RAG_LABEL[k.achievement.rag] ?? k.achievement.rag}
                                    </span>
                                  </div>
                                )}
                                {k.achievement.kind === "manual" && (
                                  <div className="text-[11px] text-muted-foreground">Manual</div>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <CommentCell
                              kpi={k.kpi}
                              profileName={profileName}
                              canEdit={canEdit}
                              onSaved={updateKpiInTree}
                            />
                          </TableCell>
                        </TableRow>,
                      );
                      firstObjRow = false;
                      firstPriRow = false;
                    }
                  }
                  return rows;
                })}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground italic mt-4">
              Initiatives not linked to the X-Matrix are governed via the Portfolio Kanban Board and reported in Initiative Delivery Status above.
            </p>
            <span className="sr-only">{totalRows} rows</span>
          </>
        )}
      </CardContent>
    </Card>
  );
}
