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
  funnel: "Funnel",
  review: "Review",
  analysis: "Analysis",
  ready: "Ready",
  in_delivery: "In Execution",
  deployed: "Deployed",
  closed: "Closed",
  archive: "Archived",
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
  const [profileMap, setProfileMap] = useState<Record<string, { full_name: string }>>({});
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [daysInStage, setDaysInStage] = useState<Record<string, number>>({});
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const fetchPData = async () => {
      setLoading(true);
      setError(false);
      try {
        // Step 1: fetch initiatives
        const { data: inits, error: initsError } = await supabase
          .from("initiatives")
          .select("id, title, stage, wsjf_score, due_date, owner_id, display_id")
          .eq("client_id", clientId)
          .in("stage", ["ready", "in_delivery", "deployed"])
          .order("title", { ascending: true });
        if (initsError) throw initsError;
        const initiatives = (inits ?? []) as PInitiative[];
        console.log("P panel initiatives:", initiatives.length, initiatives);

        // Step 2: fetch owner profiles
        const ownerIds = [
          ...new Set(initiatives.map((i) => i.owner_id).filter(Boolean)),
        ] as string[];

        const profileMap: Record<string, { full_name: string }> = {};
        if (ownerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ownerIds);

          for (const p of profiles ?? []) {
            profileMap[p.id] = p;
          }
        }

        // Step 3: fetch latest OH metric reading per initiative
        const initIds = initiatives.map((i) => i.id);
        const statusMap: Record<string, string> = {};
        if (initIds.length > 0) {
          const { data: metrics } = await supabase
            .from("initiative_metrics")
            .select("id, initiative_id")
            .eq("metric_type", "outcome_hypothesis")
            .in("initiative_id", initIds);

          const metricIds = (metrics ?? []).map((m) => m.id);
          const metricInitMap: Record<string, string> = {};
          for (const m of metrics ?? []) {
            metricInitMap[m.id] = m.initiative_id;
          }

          if (metricIds.length > 0) {
            const { data: readings } = await supabase
              .from("metric_readings")
              .select("initiative_metric_id, status_rag, reading_date")
              .in("initiative_metric_id", metricIds)
              .order("reading_date", { ascending: false });

            const seenMetrics = new Set<string>();
            for (const r of readings ?? []) {
              if (!seenMetrics.has(r.initiative_metric_id)) {
                seenMetrics.add(r.initiative_metric_id);
                const initId = metricInitMap[r.initiative_metric_id];
                if (initId && !statusMap[initId]) {
                  statusMap[initId] = r.status_rag;
                }
              }
            }
          }
        }

        // Step 4: fetch stage transitions
        const daysInStage: Record<string, number> = {};
        if (initIds.length > 0) {
          const { data: transitions } = await supabase
            .from("kanban_stage_transitions")
            .select("initiative_id, changed_at")
            .in("initiative_id", initIds)
            .order("changed_at", { ascending: false });

          const seen = new Set<string>();
          const today = new Date();
          for (const t of transitions ?? []) {
            if (!seen.has(t.initiative_id)) {
              seen.add(t.initiative_id);
              daysInStage[t.initiative_id] = Math.floor(
                (today.getTime() - new Date(t.changed_at).getTime()) /
                  (1000 * 60 * 60 * 24),
              );
            }
          }
        }

        if (!isMounted) return;
        setInitiatives(initiatives);
        setProfileMap(profileMap);
        setStatusMap(statusMap);
        setDaysInStage(daysInStage);
      } catch (e: any) {
        console.error("P panel error:", e?.message ?? e);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPData();

    return () => {
      isMounted = false;
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

  const enrichedInitiatives = initiatives.map((i) => ({
    ...i,
    ownerName: i.owner_id ? profileMap[i.owner_id]?.full_name ?? null : null,
    status: statusMap[i.id] ?? null,
    daysInStage: daysInStage[i.id] ?? null,
  }));

  const ready = enrichedInitiatives.filter((i) => i.stage === "ready");
  const inDelivery = enrichedInitiatives.filter((i) => i.stage === "in_delivery");
  const deployed = enrichedInitiatives.filter((i) =>
    i.stage === "deployed"
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
  const hasOwner = !!it.owner_id && !!it.ownerName;
  const avatarCls = hasOwner
    ? AVATAR_COLORS[idx % 4]
    : "bg-muted text-muted-foreground";
  return (
    <div className="border-t border-border py-2 px-2.5">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-medium text-muted-foreground">
            LBC-{it.display_id ?? "—"}
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
          <span>Owner: {hasOwner ? firstNameOf(it.ownerName) : "Unassigned"}</span>
          <span>
            MVP:{" "}
            {it.due_date
              ? format(new Date(it.due_date), "d MMM yyyy")
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
          {hasOwner ? initialsFor(it.ownerName) : "?"}
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
  display_id: number | null;
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
  const [profileMap, setProfileMap] = useState<Record<string, { full_name: string }>>({});
  const [metricMap, setMetricMap] = useState<
    Record<string, { metric_name: string; target_value: number | null; target_unit: string | null }>
  >({});
  const [budgetMap, setBudgetMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let isMounted = true;

    const fetchOData = async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: inits, error } = await supabase
          .from("initiatives")
          .select("id, title, stage, wsjf_score, owner_id, display_id")
          .eq("client_id", clientId)
          .in("stage", ["scoping", "review", "analysis"])
          .order("title", { ascending: true });
        if (error) throw error;

        const initiatives = (inits ?? []) as OInitiative[];
        console.log("O panel initiatives:", initiatives.length, initiatives);

        const ownerIds = [
          ...new Set(initiatives.map((i) => i.owner_id).filter(Boolean)),
        ] as string[];

        const profileMap: Record<string, { full_name: string }> = {};
        if (ownerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ownerIds);

          for (const p of profiles ?? []) profileMap[p.id] = p;
        }

        const initIds = initiatives.map((i) => i.id);
        const metricMap: Record<
          string,
          { metric_name: string; target_value: number | null; target_unit: string | null }
        > = {};
        const budgetMap: Record<string, number> = {};

        if (initIds.length > 0) {
          const { data: metrics } = await supabase
            .from("initiative_metrics")
            .select("id, initiative_id, metric_name, target_value, target_unit")
            .eq("metric_type", "outcome_hypothesis")
            .in("initiative_id", initIds);

          for (const m of metrics ?? []) {
            if (!metricMap[m.initiative_id]) metricMap[m.initiative_id] = m;
          }

          const { data: budgets } = await supabase
            .from("initiative_budget_settings")
            .select("initiative_id, approved_budget_mvp")
            .in("initiative_id", initIds);

          for (const b of budgets ?? []) {
            budgetMap[b.initiative_id] = b.approved_budget_mvp;
          }
        }

        if (!isMounted) return;
        setInitiatives(initiatives);
        setProfileMap(profileMap);
        setMetricMap(metricMap);
        setBudgetMap(budgetMap);
      } catch (e: any) {
        console.error("O panel error:", e?.message ?? e);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOData();

    return () => {
      isMounted = false;
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

  const enrichedInitiatives = initiatives.map((i) => {
    const metric = metricMap[i.id];
    return {
      ...i,
      ownerName: i.owner_id ? profileMap[i.owner_id]?.full_name ?? null : null,
      targetText:
        metric?.target_value != null
          ? `${metric.target_value} ${metric.target_unit ?? ""}`.trim()
          : "TBC",
      budget: budgetMap[i.id] ?? null,
    };
  });

  const funnel = enrichedInitiatives.filter((i) => i.stage === "scoping");
  const review = enrichedInitiatives.filter((i) => i.stage === "review");
  const analysis = enrichedInitiatives.filter((i) => i.stage === "analysis");

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

  const totalBudget = enrichedInitiatives.reduce(
    (a, i) => a + (i.budget ?? 0),
    0,
  );
  const hasBudget = enrichedInitiatives.some((i) => i.budget != null);

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
  const hasOwner = !!it.owner_id && !!it.ownerName;
  const avatarCls = hasOwner
    ? AVATAR_COLORS[idx % 4]
    : "bg-muted text-muted-foreground";
  return (
    <div className="border-t border-border py-2 px-2.5">
      <div className="flex justify-between items-start">
        <span className="text-[9px] text-muted-foreground">
          LBC-{it.display_id ?? "—"}
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
          <span>Owner: {hasOwner ? firstNameOf(it.ownerName) : "Unassigned"}</span>
          <span>Target: {it.targetText}</span>
          <span>
            Budget:{" "}
            {it.budget != null ? formatCurrency(it.budget, "CAD") : "TBC"}
          </span>
        </div>
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium ${avatarCls}`}
        >
          {hasOwner ? initialsFor(it.ownerName) : "?"}
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
    let isMounted = true;

    const fetchHData = async () => {
      setLoading(true);
      setError(false);
      try {
        // Assets - simple select, no complex filters
        const { data: assets, error: assetsError } = await supabase
          .from("assets")
          .select("id, name, asset_type, gross_floor_area")
          .eq("client_id", clientId);
        if (assetsError) console.error("assets error:", assetsError.message);

        const assetList = assets ?? [];
        const assetIds = assetList.map((a) => a.id);
        console.log("H assets:", assetList.length);

        // Emissions per asset
        const emissionsMap: Record<string, number> = {};
        if (assetIds.length > 0) {
          const { data: emissions } = await supabase
            .from("emissions")
            .select("asset_id, co2e_tonnes, reporting_year")
            .in("asset_id", assetIds);

          for (const e of emissions ?? []) {
            emissionsMap[e.asset_id] =
              (emissionsMap[e.asset_id] ?? 0) + (e.co2e_tonnes ?? 0);
          }
        }

        // Combine and sort
        const assetData = assetList
          .map((a) => ({
            ...a,
            total_co2e: emissionsMap[a.id] ?? 0,
            intensity: a.gross_floor_area
              ? (emissionsMap[a.id] ?? 0) / a.gross_floor_area
              : null,
          }))
          .sort((a, b) => b.total_co2e - a.total_co2e)
          .slice(0, 5);

        // Initiatives for blockers - NO kanban_stage filter
        const { data: initData } = await supabase
          .from("initiatives")
          .select("id, title, stage, display_id")
          .eq("client_id", clientId);

        const blockerInits = (initData ?? []).filter(
          (i) => !["closed", "archive"].includes(i.stage),
        );
        const blockerIds = blockerInits.map((i) => i.id);
        console.log("H blockers:", blockerInits.length);

        // Stage transitions - NO enum filter
        const daysMap: Record<string, number> = {};
        if (blockerIds.length > 0) {
          const { data: transitions } = await supabase
            .from("kanban_stage_transitions")
            .select("initiative_id, changed_at")
            .in("initiative_id", blockerIds)
            .order("changed_at", { ascending: false });

          const seen = new Set<string>();
          const today = new Date();
          for (const t of transitions ?? []) {
            if (!seen.has(t.initiative_id)) {
              seen.add(t.initiative_id);
              daysMap[t.initiative_id] = Math.floor(
                (today.getTime() - new Date(t.changed_at).getTime()) /
                  (1000 * 60 * 60 * 24),
              );
            }
          }
        }

        // Overdue leading indicators
        const { data: initiativeRows } = await supabase
          .from("initiatives")
          .select("id")
          .eq("client_id", clientId);

        const { data: liMetrics } = await supabase
          .from("initiative_metrics")
          .select("id, metric_name, initiative_id, measurement_frequency")
          .eq("metric_type", "leading_indicator")
          .in("initiative_id", initiativeRows?.map((i) => i.id) ?? []);

        const liIds = (liMetrics ?? []).map((m) => m.id);
        const lastReadingMap: Record<string, string> = {};

        if (liIds.length > 0) {
          const { data: liReadings } = await supabase
            .from("metric_readings")
            .select("initiative_metric_id, reading_date")
            .in("initiative_metric_id", liIds)
            .order("reading_date", { ascending: false });

          for (const r of liReadings ?? []) {
            if (!lastReadingMap[r.initiative_metric_id]) {
              lastReadingMap[r.initiative_metric_id] = r.reading_date;
            }
          }
        }

        const today2 = new Date();
        const overdue = (liMetrics ?? []).filter((m) => {
          const lastDate = lastReadingMap[m.id];
          if (!lastDate) return true;
          const days = Math.floor(
            (today2.getTime() - new Date(lastDate).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (m.measurement_frequency === "weekly") return days > 7;
          if (m.measurement_frequency === "monthly") return days > 30;
          return false;
        });

        console.log("H overdue:", overdue.length);

        // Get initiative titles for overdue metrics
        const overdueInitIds = [...new Set(overdue.map((m) => m.initiative_id))];
        const initTitleMap: Record<string, string> = {};

        if (overdueInitIds.length > 0) {
          const { data: overdueInits } = await supabase
            .from("initiatives")
            .select("id, title")
            .in("id", overdueInitIds);

          for (const i of overdueInits ?? []) {
            initTitleMap[i.id] = i.title;
          }
        }

        if (!isMounted) return;
        setAssets(assetData);
        setBlockers(
          blockerInits
            .map((i) => ({
              ...i,
              days_in_stage: daysMap[i.id] ?? null,
            }))
            .sort((a, b) => (b.days_in_stage ?? 0) - (a.days_in_stage ?? 0))
            .slice(0, 4),
        );
        setOverdue(
          overdue.map((m) => ({
            ...m,
            initiative_title: initTitleMap[m.initiative_id] ?? "",
            days_since_update: lastReadingMap[m.id]
              ? Math.floor(
                  (today2.getTime() - new Date(lastReadingMap[m.id]).getTime()) /
                    (1000 * 60 * 60 * 24),
                )
              : null,
          })),
        );
      } catch (e: any) {
        console.error("H panel error:", e?.message ?? e);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHData();

    return () => {
      isMounted = false;
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
  display_id: number | null;
  title: string;
  stage: string;
  owner_id: string | null;
  ownerName: string | null;
  due_date: string | null;
  story_count: number;
  stories_done: number;
}

function XContent({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSprint, setActiveSprint] = useState<ActiveSprint | null>(null);
  const [initiatives, setInitiatives] = useState<XInitiative[]>([]);

  useEffect(() => {
    let isMounted = true;
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
          .select("id, display_id, title, stage, wsjf_score, due_date, owner_id")
          .eq("client_id", clientId)
          .in("stage", ["ready", "in_delivery", "deployed"]);
        console.log("[XContent] sprint/initiatives:", sp?.name, (inits as any[])?.length, inits);
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
            display_id: r.display_id ?? null,
            title: r.title,
            stage: r.stage,
            owner_id: r.owner_id,
            ownerName: r.owner_id ? profileMap.get(r.owner_id) ?? null : null,
            due_date: r.due_date,
            story_count: sc.count,
            stories_done: sc.done,
          };
        });

        if (!isMounted) return;
        setActiveSprint(sp);
        setInitiatives(result);
      } catch (e) {
        console.error("[XContent] error", e);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
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
        const isEarlyWin = it.stage === "deployed";
        const daysToMVP = it.due_date
          ? differenceInDays(new Date(it.due_date), new Date())
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
