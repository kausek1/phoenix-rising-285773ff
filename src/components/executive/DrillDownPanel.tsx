import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format, differenceInDays } from "date-fns";
import {
  X,
  Building2,
  GitBranch,
  AlertTriangle,
  PlayCircle,
  Network,
  Calendar,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCurrency,
  type ExecDashboardSettings,
  type ExecDashboardTile,
} from "@/types/executiveDashboard";

interface Props {
  selectedNav: string | null;
  selectedTile: string | null;
  clientId: string;
  settings: ExecDashboardSettings | null;
  tile?: ExecDashboardTile | null;
  navLabel?: string | null;
  onClose: () => void;
}

const STAGE_LABEL: Record<string, string> = {
  analysis: "Analysis",
  ready: "Ready",
  in_delivery: "In Execution",
  review: "Review",
  scoping: "Funnel",
  commissioned: "Deployed",
  verified: "Deployed",
};

const AVATAR_COLORS = [
  "bg-blue-50 text-blue-700",
  "bg-emerald-50 text-emerald-700",
  "bg-purple-50 text-purple-700",
  "bg-amber-50 text-amber-700",
];

function EmptyStateMessage({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`text-[10px] text-muted-foreground text-center py-6 px-2 italic ${className}`}
    >
      {message}
    </div>
  );
}

function ErrorMessage() {
  return (
    <div className="text-[10px] text-red-500">
      Unable to load data — please refresh
    </div>
  );
}

function ColumnSkeletons() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function initialsFor(fullName?: string | null) {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

function firstNameOf(fullName?: string | null) {
  if (!fullName) return "Unassigned";
  return fullName.trim().split(/\s+/)[0] ?? "Unassigned";
}

function statusBadge(status: string | null | undefined) {
  if (status === "on_track")
    return { cls: "bg-emerald-50 text-emerald-700", label: "● On track" };
  if (status === "at_risk")
    return { cls: "bg-amber-50 text-amber-700", label: "● At risk" };
  if (status === "off_track")
    return { cls: "bg-red-50 text-red-700", label: "● Off track" };
  return { cls: "bg-muted text-muted-foreground", label: "● No reading" };
}

function stageBadgeCls(stage: string) {
  switch (stage) {
    case "ready":
      return "bg-blue-50 text-blue-700";
    case "in_delivery":
      return "bg-emerald-50 text-emerald-700";
    case "commissioned":
    case "verified":
      return "bg-muted text-muted-foreground";
    case "review":
      return "bg-blue-50 text-blue-700";
    case "analysis":
      return "bg-red-50 text-red-700";
    case "scoping":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function DrillDownPanel({
  selectedNav,
  selectedTile,
  clientId,
  tile,
  navLabel,
  onClose,
}: Props) {
  // Determine which content to render
  const showP =
    selectedNav === "P" ||
    selectedTile === "carbon" ||
    selectedTile === "energy";
  const showO = selectedNav === "O";
  const showH = selectedNav === "H";
  const showX = selectedNav === "X";

  let Icon: LucideIcon = Building2;
  let title = "";
  let subtitle = "";

  if (showP) {
    Icon = Building2;
    title = "Portfolio baseline";
    subtitle =
      "Active and deployed initiatives — Ready · In Execution · Deployed";
  } else if (showO) {
    Icon = GitBranch;
    title = "Options pipeline";
    subtitle = "Initiatives under evaluation — Review · Analysis · Funnel";
  } else if (showH) {
    Icon = AlertTriangle;
    title = "Hotspots & constraints";
    subtitle = "Top emissions sources and delivery blockers";
  } else if (showX) {
    Icon = PlayCircle;
    title = "Execution";
    subtitle = "90-day sprint — active delivery and early wins";
  } else {
    title = selectedNav
      ? `Stage: ${navLabel ?? selectedNav}`
      : selectedTile && tile
        ? tile.tile_label
        : "Detail";
  }

  const tileFilterBadge =
    showP && selectedTile === "carbon"
      ? { cls: "bg-emerald-50 text-emerald-700", label: "Carbon metrics" }
      : showP && selectedTile === "energy"
        ? { cls: "bg-emerald-50 text-emerald-700", label: "Energy metrics" }
        : null;

  // Placeholder
  const isPlaceholder =
    (selectedNav && ["E", "N", "I"].includes(selectedNav)) ||
    (selectedTile && ["cost", "spend", "outcomes"].includes(selectedTile));

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border mb-3 pb-2">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className="text-[#1B4F72]" />
          <span className="text-sm font-medium text-foreground">{title}</span>
          {subtitle && (
            <span className="text-[10px] text-muted-foreground ml-1.5">
              {subtitle}
            </span>
          )}
          {tileFilterBadge && (
            <span
              className={`text-[9px] px-2 rounded ml-1 ${tileFilterBadge.cls}`}
            >
              {tileFilterBadge.label}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6"
        >
          <X size={14} />
        </Button>
      </div>

      {showP && <PContent clientId={clientId} />}
      {showO && <OContent clientId={clientId} />}
      {showH && <HContent clientId={clientId} />}
      {showX && <XContent clientId={clientId} />}

      {isPlaceholder && !showP && !showO && !showH && !showX && (
        <div className="border border-dashed border-border rounded-lg p-4 text-center text-[11px] text-muted-foreground">
          {(navLabel ?? selectedNav ?? tile?.tile_label ?? "Section")} detail —
          loading in Prompt C
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// P CONTENT — Portfolio baseline
// ─────────────────────────────────────────────────────────

interface PInitiative {
  id: string;
  display_id: number | null;
  title: string;
  stage: string;
  wsjf_score: number | null;
  due_date: string | null;
  owner_id: string | null;
  ownerName: string | null;
  status: string | null;
  daysInStage: number | null;
}

function PContent({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [initiatives, setInitiatives] = useState<PInitiative[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: inits, error: e1 } = await supabase
          .from("initiatives")
          .select("id, display_id, title, stage, wsjf_score, due_date, owner_id")
          .eq("client_id", clientId)
          .in("stage", ["ready", "in_delivery", "commissioned", "verified"])
          .order("title");
        if (e1) throw e1;

        const rows = (inits as any[]) ?? [];
        const ownerIds = Array.from(
          new Set(rows.map((r) => r.owner_id).filter(Boolean)),
        );
        const initIds = rows.map((r) => r.id);

        const [{ data: profiles }, { data: metrics }, { data: trans }] =
          await Promise.all([
            ownerIds.length > 0
              ? supabase
                  .from("profiles")
                  .select("id, full_name")
                  .in("id", ownerIds)
              : Promise.resolve({ data: [] as any[] }),
            initIds.length > 0
              ? supabase
                  .from("initiative_metrics")
                  .select("id, initiative_id, metric_type")
                  .in("initiative_id", initIds)
                  .eq("metric_type", "outcome_hypothesis")
              : Promise.resolve({ data: [] as any[] }),
            initIds.length > 0
              ? supabase
                  .from("kanban_stage_transitions")
                  .select("initiative_id, changed_at")
                  .in("initiative_id", initIds)
                  .order("changed_at", { ascending: false })
              : Promise.resolve({ data: [] as any[] }),
          ]);

        const profileMap = new Map<string, string>();
        for (const p of (profiles as any[]) ?? [])
          profileMap.set(p.id, p.full_name);

        // metrics → readings
        const metricRows = (metrics as any[]) ?? [];
        const metricIds = metricRows.map((m) => m.id);
        const metricToInit = new Map<string, string>();
        for (const m of metricRows) metricToInit.set(m.id, m.initiative_id);

        let statusByInit = new Map<string, string | null>();
        if (metricIds.length > 0) {
          const { data: readings } = await supabase
            .from("metric_readings")
            .select("initiative_metric_id, reading_date, status_rag")
            .in("initiative_metric_id", metricIds)
            .order("reading_date", { ascending: false });
          const seen = new Set<string>();
          for (const r of (readings as any[]) ?? []) {
            if (seen.has(r.initiative_metric_id)) continue;
            seen.add(r.initiative_metric_id);
            const initId = metricToInit.get(r.initiative_metric_id);
            if (initId && !statusByInit.has(initId)) {
              statusByInit.set(initId, r.status_rag);
            }
          }
        }

        const latestTransByInit = new Map<string, string>();
        for (const t of (trans as any[]) ?? []) {
          if (!latestTransByInit.has(t.initiative_id)) {
            latestTransByInit.set(t.initiative_id, t.changed_at);
          }
        }

        const result: PInitiative[] = rows.map((r) => {
          const t = latestTransByInit.get(r.id);
          const days = t
            ? differenceInDays(new Date(), new Date(t))
            : null;
          return {
            id: r.id,
            display_id: r.display_id ?? null,
            title: r.title,
            stage: r.stage,
            wsjf_score: r.wsjf_score,
            due_date: r.due_date,
            owner_id: r.owner_id,
            ownerName: r.owner_id ? profileMap.get(r.owner_id) ?? null : null,
            status: statusByInit.get(r.id) ?? null,
            daysInStage: days,
          };
        });

        if (!cancelled) setInitiatives(result);
      } catch (e) {
        console.error("[PContent] error", e);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        <ColumnSkeletons />
        <ColumnSkeletons />
        <ColumnSkeletons />
      </div>
    );
  }
  if (error) return <ErrorMessage />;

  const ready = initiatives.filter((i) => i.stage === "ready");
  const inDelivery = initiatives.filter((i) => i.stage === "in_delivery");
  const deployed = initiatives.filter((i) =>
    ["commissioned", "verified"].includes(i.stage),
  );

  const cols: Array<{
    label: string;
    headerCls: string;
    items: PInitiative[];
    empty: string;
  }> = [
    {
      label: "Ready",
      headerCls: "bg-blue-50 text-blue-700",
      items: ready,
      empty: "No initiatives in ready state yet",
    },
    {
      label: "In Execution",
      headerCls: "bg-emerald-50 text-emerald-700",
      items: inDelivery,
      empty: "No initiatives in execution yet",
    },
    {
      label: "Deployed",
      headerCls: "bg-muted text-muted-foreground",
      items: deployed,
      empty: "No deployed initiatives yet",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {cols.map((c) => (
          <div
            key={c.label}
            className="border border-border rounded-lg overflow-hidden"
          >
            <div
              className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${c.headerCls}`}
            >
              <span className="text-[10px] font-medium">{c.label}</span>
              <span
                className={`text-[9px] px-1.5 py-px rounded ${c.headerCls}`}
              >
                {c.items.length}
              </span>
            </div>
            {c.items.length === 0 ? (
              <EmptyStateMessage message={c.empty} />
            ) : (
              c.items.map((it, idx) => (
                <PCard key={it.id} it={it} idx={idx} />
              ))
            )}
          </div>
        ))}
      </div>

      <div
        className="mt-3 border border-blue-200 rounded-lg p-3 bg-blue-50/40 flex items-center justify-between cursor-pointer hover:bg-blue-50/70 transition-colors"
        onClick={() => navigate({ to: "/portfolio" }).catch(() => navigate({ to: "/" }))}
      >
        <div>
          <div className="text-[10px] font-medium text-blue-700">
            <Network size={14} className="text-blue-600 inline mr-1.5" />
            X-Matrix — Annual Business Plan
          </div>
          <span className="text-[9px] text-blue-500 block mt-0.5">
            Strategy → improvement priority → KPI → initiative traceability
          </span>
        </div>
        <button
          className="text-[10px] border border-blue-300 text-blue-600 bg-transparent px-2 py-1 rounded hover:bg-blue-100 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            navigate({ to: "/portfolio" }).catch(() => navigate({ to: "/" }));
          }}
        >
          View X-Matrix ↗
        </button>
      </div>
    </>
  );
}

function PCard({ it, idx }: { it: PInitiative; idx: number }) {
  const sb = statusBadge(it.status);
  const avatarCls = AVATAR_COLORS[idx % 4];
  return (
    <div className="border-t border-border py-2 px-2.5">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-medium text-muted-foreground">
            LBC-{it.id.slice(0, 8)}
          </span>
          <span className={`text-[9px] px-1.5 rounded ${sb.cls}`}>
            {sb.label}
          </span>
        </div>
        {it.wsjf_score != null && (
          <span className="bg-[#1B4F72] text-white text-[9px] px-1.5 py-px rounded font-medium">
            {Number(it.wsjf_score).toFixed(1)}
          </span>
        )}
      </div>
      <div className="text-[11px] font-medium leading-snug mb-1 mt-0.5">
        {it.title}
      </div>
      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-px text-[9px] text-muted-foreground">
          <span>Owner: {firstNameOf(it.ownerName)}</span>
          <span>
            MVP:{" "}
            {it.target_mvp_date
              ? format(new Date(it.target_mvp_date), "d MMM yyyy")
              : "Not set"}
          </span>
          <span>
            {it.daysInStage != null ? `${it.daysInStage}d` : "–"} in{" "}
            {STAGE_LABEL[it.stage] ?? it.stage}
          </span>
        </div>
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium ${avatarCls}`}
        >
          {initialsFor(it.ownerName)}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// O CONTENT — Options pipeline
// ─────────────────────────────────────────────────────────

interface OInitiative {
  id: string;
  title: string;
  stage: string;
  wsjf_score: number | null;
  owner_id: string | null;
  ownerName: string | null;
  targetText: string;
  budget: number | null;
}

function OContent({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [initiatives, setInitiatives] = useState<OInitiative[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: inits, error: e1 } = await supabase
          .from("initiatives")
          .select("id, title, stage, wsjf_score, owner_id")
          .eq("client_id", clientId)
          .in("stage", ["scoping", "review", "analysis"])
          .order("title");
        if (e1) throw e1;

        const rows = (inits as any[]) ?? [];
        const ownerIds = Array.from(
          new Set(rows.map((r) => r.owner_id).filter(Boolean)),
        );
        const initIds = rows.map((r) => r.id);

        const [{ data: profiles }, { data: metrics }, { data: budgets }] =
          await Promise.all([
            ownerIds.length > 0
              ? supabase
                  .from("profiles")
                  .select("id, full_name")
                  .in("id", ownerIds)
              : Promise.resolve({ data: [] as any[] }),
            initIds.length > 0
              ? supabase
                  .from("initiative_metrics")
                  .select(
                    "initiative_id, metric_name, target_value, target_unit, metric_type, created_at",
                  )
                  .in("initiative_id", initIds)
                  .eq("metric_type", "outcome_hypothesis")
                  .order("created_at", { ascending: true })
              : Promise.resolve({ data: [] as any[] }),
            initIds.length > 0
              ? supabase
                  .from("initiative_budget_settings")
                  .select("initiative_id, approved_budget_mvp")
                  .in("initiative_id", initIds)
              : Promise.resolve({ data: [] as any[] }),
          ]);

        const profileMap = new Map<string, string>();
        for (const p of (profiles as any[]) ?? [])
          profileMap.set(p.id, p.full_name);

        const targetByInit = new Map<string, string>();
        for (const m of (metrics as any[]) ?? []) {
          if (!targetByInit.has(m.initiative_id)) {
            targetByInit.set(
              m.initiative_id,
              m.target_value != null
                ? `${m.target_value} ${m.target_unit ?? ""}`.trim()
                : "TBC",
            );
          }
        }

        const budgetByInit = new Map<string, number>();
        for (const b of (budgets as any[]) ?? []) {
          budgetByInit.set(b.initiative_id, Number(b.approved_budget_mvp));
        }

        const result: OInitiative[] = rows.map((r) => ({
          id: r.id,
          title: r.title,
          stage: r.stage,
          wsjf_score: r.wsjf_score,
          owner_id: r.owner_id,
          ownerName: r.owner_id ? profileMap.get(r.owner_id) ?? null : null,
          targetText: targetByInit.get(r.id) ?? "TBC",
          budget: budgetByInit.get(r.id) ?? null,
        }));

        if (!cancelled) setInitiatives(result);
      } catch (e) {
        console.error("[OContent] error", e);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        <ColumnSkeletons />
        <ColumnSkeletons />
        <ColumnSkeletons />
      </div>
    );
  }
  if (error) return <ErrorMessage />;

  const funnel = initiatives.filter((i) => i.stage === "scoping");
  const review = initiatives.filter((i) => i.stage === "review");
  const analysis = initiatives.filter((i) => i.stage === "analysis");

  const cols: Array<{
    label: string;
    headerCls: string;
    items: OInitiative[];
    empty: string;
  }> = [
    {
      label: "Funnel",
      headerCls: "bg-amber-50 text-amber-700",
      items: funnel,
      empty: "No initiatives in funnel yet",
    },
    {
      label: "Review",
      headerCls: "bg-blue-50 text-blue-700",
      items: review,
      empty: "No initiatives under review yet",
    },
    {
      label: "Analysis",
      headerCls: "bg-red-50/60 text-red-700",
      items: analysis,
      empty: "No initiatives in analysis yet",
    },
  ];

  const totalBudget = initiatives.reduce(
    (a, i) => a + (i.budget ?? 0),
    0,
  );
  const hasBudget = initiatives.some((i) => i.budget != null);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {cols.map((c) => (
          <div
            key={c.label}
            className="border border-border rounded-lg overflow-hidden"
          >
            <div
              className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${c.headerCls}`}
            >
              <span className="text-[10px] font-medium">{c.label}</span>
              <span
                className={`text-[9px] px-1.5 py-px rounded ${c.headerCls}`}
              >
                {c.items.length}
              </span>
            </div>
            {c.items.length === 0 ? (
              <EmptyStateMessage message={c.empty} />
            ) : (
              c.items.map((it, idx) => <OCard key={it.id} it={it} idx={idx} />)
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 bg-muted/30 rounded-lg p-2 text-[9px] text-muted-foreground">
        Pipeline: {initiatives.length} initiatives in evaluation
        {hasBudget &&
          ` · ${formatCurrency(totalBudget, "CAD")} CAD in assessment`}
      </div>
    </>
  );
}

function OCard({ it, idx }: { it: OInitiative; idx: number }) {
  const avatarCls = AVATAR_COLORS[idx % 4];
  return (
    <div className="border-t border-border py-2 px-2.5">
      <div className="flex justify-between items-start">
        <span className="text-[9px] text-muted-foreground">
          LBC-{it.id.slice(0, 8)}
        </span>
        {it.wsjf_score != null ? (
          <span className="bg-[#1B4F72] text-white text-[9px] px-1.5 py-px rounded font-medium">
            {Number(it.wsjf_score).toFixed(1)}
          </span>
        ) : (
          <span className="text-[9px] text-muted-foreground">WSJF TBC</span>
        )}
      </div>
      <div className="text-[11px] font-medium leading-snug mb-1 mt-0.5">
        {it.title}
      </div>
      <div className="flex justify-between items-end">
        <div className="text-[9px] text-muted-foreground flex flex-col gap-px">
          <span>Owner: {firstNameOf(it.ownerName)}</span>
          <span>Target: {it.targetText}</span>
          <span>
            Budget:{" "}
            {it.budget != null ? formatCurrency(it.budget, "CAD") : "TBC"}
          </span>
        </div>
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium ${avatarCls}`}
        >
          {initialsFor(it.ownerName)}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// H CONTENT — Hotspots & constraints
// ─────────────────────────────────────────────────────────

interface AssetHot {
  id: string;
  name: string;
  total_co2e: number;
  intensity: number | null;
}

interface BlockerInit {
  id: string;
  title: string;
  stage: string;
  days_in_stage: number | null;
}

interface OverdueMetric {
  id: string;
  metric_name: string;
  initiative_title: string;
  days_since_update: number | null;
}

function HContent({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [assets, setAssets] = useState<AssetHot[]>([]);
  const [blockers, setBlockers] = useState<BlockerInit[]>([]);
  const [overdue, setOverdue] = useState<OverdueMetric[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        // Assets + emissions
        const { data: assetRows } = await supabase
          .from("assets")
          .select("id, name, asset_type, gross_floor_area")
          .eq("client_id", clientId);
        const aIds = ((assetRows as any[]) ?? []).map((a) => a.id);
        let emissions: any[] = [];
        if (aIds.length > 0) {
          const { data: e } = await supabase
            .from("emissions")
            .select("asset_id, co2e_tonnes")
            .in("asset_id", aIds);
          emissions = (e as any[]) ?? [];
        }
        const sumByAsset = new Map<string, number>();
        for (const e of emissions) {
          sumByAsset.set(
            e.asset_id,
            (sumByAsset.get(e.asset_id) ?? 0) +
              (Number(e.co2e_tonnes) || 0),
          );
        }
        const aHot: AssetHot[] = ((assetRows as any[]) ?? [])
          .map((a) => {
            const total = sumByAsset.get(a.id) ?? 0;
            const intensity =
              a.gross_floor_area && a.gross_floor_area > 0
                ? (total * 1000) / a.gross_floor_area
                : null;
            return {
              id: a.id,
              name: a.name,
              total_co2e: total,
              intensity,
            };
          })
          .filter((a) => a.total_co2e > 0)
          .sort((a, b) => b.total_co2e - a.total_co2e)
          .slice(0, 5);

        // Blockers - stage flow
        const { data: inits } = await supabase
          .from("initiatives")
          .select("id, title, stage")
          .eq("client_id", clientId)
          .not("stage", "in", "(verified,closed)");
        const initIds = ((inits as any[]) ?? []).map((i) => i.id);
        let trans: any[] = [];
        if (initIds.length > 0) {
          const { data: t } = await supabase
            .from("kanban_stage_transitions")
            .select("initiative_id, changed_at")
            .in("initiative_id", initIds)
            .order("changed_at", { ascending: false });
          trans = (t as any[]) ?? [];
        }
        const lastTrans = new Map<string, string>();
        for (const t of trans) {
          if (!lastTrans.has(t.initiative_id))
            lastTrans.set(t.initiative_id, t.changed_at);
        }
        const blk: BlockerInit[] = ((inits as any[]) ?? [])
          .map((i) => {
            const t = lastTrans.get(i.id);
            return {
              id: i.id,
              title: i.title,
              stage: i.stage,
              days_in_stage: t
                ? differenceInDays(new Date(), new Date(t))
                : null,
            };
          })
          .sort((a, b) => {
            if (a.days_in_stage == null) return 1;
            if (b.days_in_stage == null) return -1;
            return b.days_in_stage - a.days_in_stage;
          })
          .slice(0, 4);

        // Overdue leading indicators
        let overdueResult: OverdueMetric[] = [];
        const { data: leadingMetrics } = await supabase
          .from("initiative_metrics")
          .select(
            "id, metric_name, measurement_frequency, initiative_id",
          )
          .eq("metric_type", "leading_indicator")
          .in(
            "initiative_id",
            ((await supabase
              .from("initiatives")
              .select("id")
              .eq("client_id", clientId)).data as any[] ?? []).map(
              (r) => r.id,
            ),
          );
        const lmRows = (leadingMetrics as any[]) ?? [];
        if (lmRows.length > 0) {
          const lmIds = lmRows.map((m) => m.id);
          const { data: readings } = await supabase
            .from("metric_readings")
            .select("initiative_metric_id, reading_date")
            .in("initiative_metric_id", lmIds)
            .order("reading_date", { ascending: false });
          const latest = new Map<string, string>();
          for (const r of (readings as any[]) ?? []) {
            if (!latest.has(r.initiative_metric_id))
              latest.set(r.initiative_metric_id, r.reading_date);
          }
          const initIds2 = Array.from(
            new Set(lmRows.map((m) => m.initiative_id)),
          );
          const { data: initTitles } = await supabase
            .from("initiatives")
            .select("id, title")
            .in("id", initIds2);
          const titleMap = new Map<string, string>();
          for (const i of (initTitles as any[]) ?? [])
            titleMap.set(i.id, i.title);

          const today = new Date();
          for (const m of lmRows) {
            const lastDate = latest.get(m.id);
            const days = lastDate
              ? differenceInDays(today, new Date(lastDate))
              : null;
            const freq = m.measurement_frequency;
            const isOverdue =
              days == null ||
              (freq === "weekly" && days > 7) ||
              (freq === "monthly" && days > 30);
            if (isOverdue) {
              overdueResult.push({
                id: m.id,
                metric_name: m.metric_name,
                initiative_title:
                  titleMap.get(m.initiative_id) ?? "Unknown",
                days_since_update: days,
              });
            }
          }
          overdueResult.sort((a, b) => {
            if (a.days_since_update == null) return -1;
            if (b.days_since_update == null) return 1;
            return b.days_since_update - a.days_since_update;
          });
          overdueResult = overdueResult.slice(0, 4);
        }

        if (!cancelled) {
          setAssets(aHot);
          setBlockers(blk);
          setOverdue(overdueResult);
        }
      } catch (e) {
        console.error("[HContent] error", e);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <ColumnSkeletons />
        <ColumnSkeletons />
      </div>
    );
  }
  if (error) return <ErrorMessage />;

  const maxCO2 = assets.reduce((a, b) => Math.max(a, b.total_co2e), 0) || 1;

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Left: top emitters */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Top-emitting assets
        </div>
        {assets.length === 0 ? (
          <EmptyStateMessage message="No emissions data recorded yet" />
        ) : (
          assets.map((a) => {
            const barColor =
              (a.intensity ?? 0) > 150
                ? "bg-red-400"
                : (a.intensity ?? 0) > 100
                  ? "bg-amber-400"
                  : "bg-emerald-400";
            return (
              <div key={a.id} className="mb-3">
                <div className="text-[11px] font-medium mb-0.5">{a.name}</div>
                <div className="h-1.5 rounded-full bg-muted mb-0.5 overflow-hidden">
                  <div
                    className={`h-full ${barColor}`}
                    style={{
                      width: `${Math.round(
                        (100 * a.total_co2e) / maxCO2,
                      )}%`,
                    }}
                  />
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {a.total_co2e.toFixed(0)} tCO₂e ·{" "}
                  {a.intensity != null ? a.intensity.toFixed(1) : "–"}{" "}
                  kgCO₂e/m²
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Right: blockers */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Delivery blockers
        </div>

        <div className="mb-3">
          <div className="text-[9px] text-muted-foreground mb-1">
            Initiatives by days in current stage
          </div>
          {blockers.length === 0 ? (
            <EmptyStateMessage message="No stage transition data yet" />
          ) : (
            blockers.map((b) => {
              const d = b.days_in_stage;
              const dCls =
                d != null && d > 30
                  ? "text-red-600"
                  : d != null && d > 14
                    ? "text-amber-600"
                    : "text-muted-foreground";
              return (
                <div
                  key={b.id}
                  className="flex justify-between items-center mb-1"
                >
                  <div className="flex items-center max-w-[60%] truncate">
                    <span className="text-[10px] font-medium truncate">
                      {b.title}
                    </span>
                    <span
                      className={`text-[9px] ml-1 px-1 rounded ${stageBadgeCls(b.stage)}`}
                    >
                      {STAGE_LABEL[b.stage] ?? b.stage}
                    </span>
                  </div>
                  <span className={`text-[9px] font-medium ${dCls}`}>
                    {d != null ? `${d}d` : "–"}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div>
          <div className="text-[9px] text-muted-foreground mb-1">
            Leading indicators not updated on schedule
          </div>
          {overdue.length === 0 ? (
            <EmptyStateMessage
              message="All leading indicators are current"
              className="!text-emerald-600"
            />
          ) : (
            overdue.map((m) => (
              <div key={m.id} className="mb-1.5">
                <div className="text-[10px] font-medium">{m.metric_name}</div>
                <div className="text-[9px] text-muted-foreground">
                  {m.initiative_title}
                </div>
                <span className="bg-red-50 text-red-700 text-[9px] px-1.5 rounded">
                  {m.days_since_update != null
                    ? `${m.days_since_update} days overdue`
                    : "Never updated"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// X CONTENT — Execution
// ─────────────────────────────────────────────────────────

interface ActiveSprint {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface XInitiative {
  id: string;
  title: string;
  stage: string;
  owner_id: string | null;
  ownerName: string | null;
  target_mvp_date: string | null;
  story_count: number;
  stories_done: number;
}

function XContent({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSprint, setActiveSprint] = useState<ActiveSprint | null>(null);
  const [initiatives, setInitiatives] = useState<XInitiative[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data: sprints } = await supabase
          .from("sprints")
          .select("id, name, start_date, end_date")
          .eq("client_id", clientId)
          .eq("is_committed", true)
          .lte("start_date", today)
          .gte("end_date", today)
          .limit(1);
        const sp = ((sprints as any[]) ?? [])[0] ?? null;

        const { data: inits } = await supabase
          .from("initiatives")
          .select("id, title, stage, owner_id, target_mvp_date")
          .eq("client_id", clientId)
          .in("stage", ["ready", "in_delivery", "commissioned", "verified"]);
        const rows = ((inits as any[]) ?? []).sort((a, b) => {
          const order: Record<string, number> = {
            in_delivery: 1,
            ready: 2,
            commissioned: 3,
            verified: 4,
          };
          return (order[a.stage] ?? 99) - (order[b.stage] ?? 99);
        });

        const ownerIds = Array.from(
          new Set(rows.map((r) => r.owner_id).filter(Boolean)),
        );
        const { data: profiles } =
          ownerIds.length > 0
            ? await supabase
                .from("profiles")
                .select("id, full_name")
                .in("id", ownerIds)
            : { data: [] as any[] };
        const profileMap = new Map<string, string>();
        for (const p of (profiles as any[]) ?? [])
          profileMap.set(p.id, p.full_name);

        let storyByInit = new Map<string, { count: number; done: number }>();
        if (sp && rows.length > 0) {
          const initIds = rows.map((r) => r.id);
          const { data: stories } = await supabase
            .from("kanban_stories")
            .select("initiative_id, stage")
            .eq("sprint_id", sp.id)
            .in("initiative_id", initIds);
          for (const s of (stories as any[]) ?? []) {
            const cur = storyByInit.get(s.initiative_id) ?? {
              count: 0,
              done: 0,
            };
            cur.count += 1;
            if (s.stage === "done") cur.done += 1;
            storyByInit.set(s.initiative_id, cur);
          }
        }

        const result: XInitiative[] = rows.map((r) => {
          const sc = storyByInit.get(r.id) ?? { count: 0, done: 0 };
          return {
            id: r.id,
            title: r.title,
            stage: r.stage,
            owner_id: r.owner_id,
            ownerName: r.owner_id ? profileMap.get(r.owner_id) ?? null : null,
            target_mvp_date: r.target_mvp_date,
            story_count: sc.count,
            stories_done: sc.done,
          };
        });

        if (!cancelled) {
          setActiveSprint(sp);
          setInitiatives(result);
        }
      } catch (e) {
        console.error("[XContent] error", e);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (error) return <ErrorMessage />;

  if (initiatives.length === 0) {
    return <EmptyStateMessage message="No active delivery initiatives" />;
  }

  return (
    <div className="flex flex-col">
      {activeSprint && (
        <div className="mb-3 bg-emerald-50 rounded-lg px-3 py-2 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-emerald-700">
              {activeSprint.name}
            </span>
            <span className="text-[9px] text-emerald-600 ml-1">
              active · {format(new Date(activeSprint.start_date), "d MMM")} –{" "}
              {format(new Date(activeSprint.end_date), "d MMM yyyy")}
            </span>
          </div>
          <Calendar size={12} className="text-emerald-500" />
        </div>
      )}

      {initiatives.map((it) => {
        const isEarlyWin = ["commissioned", "verified"].includes(it.stage);
        const daysToMVP = it.target_mvp_date
          ? differenceInDays(new Date(it.target_mvp_date), new Date())
          : null;
        let mvpEl: React.ReactNode = null;
        if (daysToMVP != null) {
          if (daysToMVP < 0) {
            mvpEl = (
              <span className="text-[9px] text-red-600 font-medium">
                MVP overdue
              </span>
            );
          } else if (daysToMVP <= 7) {
            mvpEl = (
              <span className="text-[9px] text-red-600 font-medium">
                {daysToMVP}d to MVP
              </span>
            );
          } else if (daysToMVP <= 30) {
            mvpEl = (
              <span className="text-[9px] text-amber-600">
                {daysToMVP}d to MVP
              </span>
            );
          } else {
            mvpEl = (
              <span className="text-[9px] text-emerald-600">
                {daysToMVP}d to MVP
              </span>
            );
          }
        }

        const pct =
          it.story_count > 0
            ? Math.round((100 * it.stories_done) / it.story_count)
            : 0;
        const fillCls =
          pct >= 80
            ? "bg-emerald-400"
            : pct >= 40
              ? "bg-amber-400"
              : "bg-blue-400";

        return (
          <div key={it.id} className="border rounded-lg p-3 mb-2">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center">
                <span
                  className={`text-[9px] px-1.5 rounded ${stageBadgeCls(it.stage)}`}
                >
                  {STAGE_LABEL[it.stage] ?? it.stage}
                </span>
                <span className="text-[11px] font-medium ml-1.5">
                  {it.title}
                </span>
              </div>
              {mvpEl}
            </div>

            {isEarlyWin ? (
              <span className="bg-emerald-100 text-emerald-700 text-[9px] px-2 py-px rounded font-medium">
                Early win ✓
              </span>
            ) : (
              <>
                <div className="text-[9px] text-muted-foreground flex gap-3 mb-1.5">
                  <span>Owner: {firstNameOf(it.ownerName)}</span>
                  {activeSprint ? (
                    <>
                      <span>Sprint: {activeSprint.name}</span>
                      <span>
                        Stories: {it.stories_done}/{it.story_count} done
                      </span>
                    </>
                  ) : (
                    <span>No active sprint</span>
                  )}
                </div>
                {activeSprint && it.story_count > 0 && (
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${fillCls}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
