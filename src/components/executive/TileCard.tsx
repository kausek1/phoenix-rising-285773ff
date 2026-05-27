import { useEffect, useState } from "react";
import * as LucideIcons from "lucide-react";
import { Leaf } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACCENT_MAP,
  formatCurrency,
  type ExecDashboardTile,
} from "@/types/executiveDashboard";

interface Props {
  tile: ExecDashboardTile;
  isSelected: boolean;
  isRelated: boolean;
  onClick: () => void;
  clientId: string;
  refreshKey: number;
}

interface Computed {
  primary: string;
  sublabelOverride?: string;
  extra?: React.ReactNode;
}

const NAV_PILL_COLOR: Record<string, string> = {
  P: "bg-blue-50 text-blue-700",
  E: "bg-amber-50 text-amber-700",
  I: "bg-emerald-50 text-emerald-700",
  N: "bg-purple-50 text-purple-700",
  X: "bg-emerald-50 text-emerald-700",
};

export default function TileCard({
  tile,
  isSelected,
  isRelated,
  onClick,
  clientId,
  refreshKey,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [computed, setComputed] = useState<Computed | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await computeTileValue(tile, clientId);
        if (!cancelled) setComputed(result);
      } catch (e) {
        console.error("[TileCard] compute error:", e);
        if (!cancelled) setComputed({ primary: "—" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tile.id, clientId, refreshKey]);

  const accent = ACCENT_MAP[tile.accent_color] ?? ACCENT_MAP.navy;
  const IconComp =
    (LucideIcons as unknown as Record<
      string,
      React.ComponentType<{ size?: number; className?: string }>
    >)[tile.icon_name] ?? Leaf;

  const sublabel = computed?.sublabelOverride ?? tile.tile_sublabel ?? "";
  const navPillColor = tile.navigator_link
    ? NAV_PILL_COLOR[tile.navigator_link] ?? "bg-muted text-muted-foreground"
    : "bg-muted text-muted-foreground";

  return (
    <div
      onClick={onClick}
      className={[
        "rounded-xl border border-l-[3px] p-3 cursor-pointer transition-all flex flex-col gap-0.5 bg-white",
        accent.borderLeft,
        isSelected ? `border-2 ${accent.selectedBorder} ${accent.selectedBg}` : "",
        isRelated ? "outline outline-1 outline-emerald-400" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1">
        <IconComp size={14} className="text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">{tile.tile_label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-5 w-16 mt-0.5" />
      ) : (
        <div className={`text-[22px] font-medium leading-none mt-0.5 ${accent.value}`}>
          {computed?.primary ?? "—"}
        </div>
      )}
      {sublabel && (
        <div className="text-[11px] text-muted-foreground/70">{sublabel}</div>
      )}
      {computed?.extra}
      {tile.navigator_link_label && (
        <div className="mt-1.5">
          <span className={`text-[10px] font-medium px-1.5 py-px rounded ${navPillColor}`}>
            {tile.navigator_link_label}
          </span>
        </div>
      )}
    </div>
  );
}

async function computeTileValue(
  tile: ExecDashboardTile,
  clientId: string,
): Promise<Computed> {
  const currency = tile.currency_code ?? "CAD";

  if (tile.value_aggregation === "sum") {
    // initiatives in client (optional stage filter)
    // stage column is a kanban_stage ENUM.
    let initQ = supabase.from("initiatives").select("id").eq("client_id", clientId).eq("initiative_type", "lbc");
    if (tile.initiative_stages && tile.initiative_stages.length > 0) {
      const VALID_STAGES = [
        "funnel", "review", "analysis", "ready",
        "in_delivery", "deployed", "closed", "archive",
      ];
      const safeStages = tile.initiative_stages.filter((s) =>
        VALID_STAGES.includes(s),
      );
      if (safeStages.length > 0) {
        initQ = initQ.in("stage", safeStages);
      }
    }
    const { data: inits, error: initError } = await initQ;
    if (initError) {
      console.error("[TileCard sum] initiatives error:", initError.message);
      return { primary: "—" };
    }
    const initIds = (inits ?? []).map((r: any) => r.id);
    if (initIds.length === 0) return { primary: formatValue(0, tile, currency) };

    // metric_category is a single TEXT column — use .in() not .overlaps()
    let mQ = supabase.from("initiative_metrics").select("id").in("initiative_id", initIds);
    if (tile.metric_type) mQ = mQ.eq("metric_type", tile.metric_type);
    if (tile.metric_categories && tile.metric_categories.length > 0) {
      // metric_category is a TEXT column — cast to any to bypass
      // generated type restrictions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mQ = (mQ as any).in("metric_category", tile.metric_categories);
    }
    const { data: metrics, error: metricError } = await mQ;
    if (metricError) {
      console.error("[TileCard sum] metrics error:", metricError.message);
      return { primary: "—" };
    }
    const metricIds = (metrics ?? []).map((r: any) => r.id);
    if (metricIds.length === 0) return { primary: formatValue(0, tile, currency) };

    const { data: readings, error: readingError } = await supabase
      .from("metric_readings")
      .select("metric_id, reading_date, reported_value")
      .in("metric_id", metricIds)
      .order("reading_date", { ascending: false });
    if (readingError) {
      console.error("[TileCard sum] readings error:", readingError.message);
      return { primary: "—" };
    }

    const latestByMetric = new Map<string, number>();
    for (const r of readings ?? []) {
      const id = (r as any).metric_id as string;
      if (!latestByMetric.has(id)) {
        latestByMetric.set(id, Number((r as any).reported_value) || 0);
      }
    }
    const sum = Array.from(latestByMetric.values()).reduce((a, b) => a + b, 0);
    return { primary: formatValue(sum, tile, currency) };
  }

  if (tile.value_aggregation === "pct_on_track") {
    const { data: inits } = await supabase
      .from("initiatives")
      .select("id")
      .eq("client_id", clientId);
    const initIds = (inits ?? []).map((r: any) => r.id);
    if (initIds.length === 0) return { primary: "0%" };

    const { data: metrics } = await supabase
      .from("initiative_metrics")
      .select("id")
      .in("initiative_id", initIds)
      .eq("metric_type", "outcome_hypothesis");
    const metricIds = (metrics ?? []).map((r: any) => r.id);
    if (metricIds.length === 0) return { primary: "0%" };

    const { data: readings } = await supabase
      .from("metric_readings")
      .select("metric_id, reading_date, status_rag")
      .in("metric_id", metricIds)
      .order("reading_date", { ascending: false });

    const latest = new Map<string, string | null>();
    for (const r of readings ?? []) {
      const id = (r as any).metric_id as string;
      if (!latest.has(id)) latest.set(id, (r as any).status_rag);
    }
    let onTrack = 0;
    for (const id of metricIds) {
      if (latest.get(id) === "on_track") onTrack++;
    }
    const pct = Math.round((100 * onTrack) / metricIds.length);
    return { primary: `${pct}%` };
  }

  if (tile.value_aggregation === "budget_vs_actual") {
    const { data: inits } = await supabase
      .from("initiatives")
      .select("id")
      .eq("client_id", clientId);
    const initIds = (inits ?? []).map((r: any) => r.id);
    if (initIds.length === 0) {
      return {
        primary: formatCurrency(0, currency),
        sublabelOverride: `of ${formatCurrency(0, currency)} approved · 0% deployed`,
      };
    }

    const [{ data: spend }, { data: budgets }] = await Promise.all([
      supabase
        .from("initiative_actual_spend")
        .select("initiative_id, spend_amount")
        .in("initiative_id", initIds),
      supabase
        .from("initiative_budget_settings")
        .select("initiative_id, approved_budget_mvp")
        .in("initiative_id", initIds),
    ]);

    const totalSpent = (spend ?? []).reduce(
      (a: number, r: any) => a + (Number(r.spend_amount) || 0),
      0,
    );
    const totalBudget = (budgets ?? []).reduce(
      (a: number, r: any) => a + (Number(r.approved_budget_mvp) || 0),
      0,
    );
    const spendByInit = new Map<string, number>();
    for (const r of spend ?? []) {
      const id = (r as any).initiative_id as string;
      spendByInit.set(id, (spendByInit.get(id) ?? 0) + (Number((r as any).spend_amount) || 0));
    }
    let overCount = 0;
    for (const b of budgets ?? []) {
      const id = (b as any).initiative_id as string;
      const bud = Number((b as any).approved_budget_mvp) || 0;
      if ((spendByInit.get(id) ?? 0) > bud) overCount++;
    }
    const pct = totalBudget > 0 ? (100 * totalSpent) / totalBudget : 0;
    const barColor =
      pct <= 80 ? "bg-emerald-400" : pct <= 100 ? "bg-amber-400" : "bg-red-500";

    return {
      primary: formatCurrency(totalSpent, currency),
      sublabelOverride: `of ${formatCurrency(totalBudget, currency)} approved · ${Math.round(pct)}% deployed`,
      extra: (
        <div className="mt-1 flex flex-col gap-1">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full ${barColor}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          {overCount > 0 && (
            <span className="self-start bg-red-50 text-red-700 text-[10px] px-1.5 rounded">
              {overCount} over budget
            </span>
          )}
        </div>
      ),
    };
  }

  return { primary: "—" };
}

function formatValue(value: number, tile: ExecDashboardTile, currency: string) {
  if (tile.display_format === "currency") {
    return formatCurrency(value, currency) + (tile.display_unit ? ` ${tile.display_unit}` : "");
  }
  if (tile.display_format === "number") {
    return (
      value.toLocaleString() + (tile.display_unit ? ` ${tile.display_unit}` : "")
    );
  }
  return String(value) + (tile.display_unit ? ` ${tile.display_unit}` : "");
}
