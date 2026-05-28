import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Flame, RefreshCw, MousePointerClick } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useReferenceDate } from "@/lib/reference-date";
import { useAuth } from "@/lib/auth";
import TileCard from "./TileCard";
import DrillDownPanel from "./DrillDownPanel";
import type {
  ExecDashboardSettings,
  ExecDashboardTile,
} from "@/types/executiveDashboard";


type StageKey = "P" | "H" | "O" | "E" | "N" | "I" | "X";

interface StageDef {
  key: StageKey;
  word: string;
  badgeClass: string;
}

const STAGES: StageDef[] = [
  { key: "P", word: "Portfolio baseline", badgeClass: "bg-emerald-50 text-emerald-700" },
  { key: "H", word: "Hotspots & constraints", badgeClass: "bg-red-50 text-red-700" },
  { key: "O", word: "Options pipeline", badgeClass: "bg-amber-50 text-amber-700" },
  { key: "E", word: "Economics & funding", badgeClass: "bg-red-50 text-red-700" },
  { key: "N", word: "Networked delivery", badgeClass: "bg-emerald-50 text-emerald-700" },
  { key: "I", word: "Implementation system", badgeClass: "bg-amber-50 text-amber-700" },
  { key: "X", word: "Execution", badgeClass: "bg-emerald-50 text-emerald-700" },
];

interface PIBadge {
  name: string;
  start_date: string;
  end_date: string;
}

export default function ExecutiveDashboard() {
  const referenceDate = useReferenceDate();
  const refDateIso = useMemo(() => format(referenceDate, "yyyy-MM-dd"), [referenceDate]);
  const [settings, setSettings] = useState<ExecDashboardSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [tileConfigs, setTileConfigs] = useState<ExecDashboardTile[]>([]);
  const [tilesLoading, setTilesLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [pi, setPi] = useState<PIBadge | null>(null);
  const [stageBadges, setStageBadges] = useState<Record<StageKey, string>>({
    P: "…",
    H: "…",
    O: "…",
    E: "…",
    N: "…",
    I: "…",
    X: "…",
  });

  const [selectedNav, setSelectedNav] = useState<string | null>(null);
  const [selectedTile, setSelectedTile] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load settings + tiles
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSettingsLoading(true);
      setTilesLoading(true);
      setConfigError(null);
      try {
        const [{ data: s, error: se }, { data: t, error: te }] = await Promise.all([
          supabase
            .from("executive_dashboard_settings")
            .select("*")
            .eq("client_id", CLIENT_ID)
            .maybeSingle(),
          supabase
            .from("executive_dashboard_tiles")
            .select("*")
            .eq("client_id", CLIENT_ID)
            .eq("is_active", true)
            .order("display_order"),
        ]);
        if (cancelled) return;
        if (se || te) {
          setConfigError(se?.message ?? te?.message ?? "Configuration error");
        }
        setSettings((s as ExecDashboardSettings) ?? null);
        setTileConfigs(((t as ExecDashboardTile[]) ?? []));
      } catch (e: any) {
        if (!cancelled) setConfigError(e?.message ?? "Configuration error");
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
          setTilesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Load PI badge
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = refDateIso;
      const { data } = await supabase
        .from("planning_increments")
        .select("name, start_date, end_date")
        .eq("client_id", CLIENT_ID)
        .lte("start_date", today)
        .gte("end_date", today)
        .limit(1);
      if (cancelled) return;
      setPi(((data ?? [])[0] as PIBadge) ?? null);
    })();
  }, [refreshKey, refDateIso]);

  // Load stage badge counts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<StageKey, string> = {
        P: "—",
        H: "—",
        O: "—",
        E: "—",
        N: "—",
        I: "—",
        X: "—",
      };

      try {
        // Initiatives for client (used by several queries)
        const { data: initRows } = await supabase
          .from("initiatives")
          .select("id, stage")
          .eq("client_id", CLIENT_ID)
          .eq("initiative_type", "lbc");
        const initIds = (initRows ?? []).map((r: any) => r.id);

        // P
        const pCount = (initRows ?? []).filter((r: any) =>
          ["ready", "in_delivery", "deployed"].includes(r.stage),
        ).length;
        next.P = `${pCount} active`;

        // O
        const oCount = (initRows ?? []).filter((r: any) =>
          ["funnel", "review", "analysis"].includes(r.stage),
        ).length;
        next.O = `${oCount} in funnel`;

        // H — latest reading off_track on leading_indicator metrics
        if (initIds.length > 0) {
          const { data: leadingMetrics } = await supabase
            .from("initiative_metrics")
            .select("id")
            .in("initiative_id", initIds)
            .eq("metric_type", "leading_indicator");
          const lmIds = (leadingMetrics ?? []).map((r: any) => r.id);
          if (lmIds.length > 0) {
            const { data: readings } = await supabase
              .from("metric_readings")
              .select("initiative_metric_id, reading_date, status_rag")
              .in("initiative_metric_id", lmIds)
              .order("reading_date", { ascending: false });
            const latest = new Map<string, string | null>();
            for (const r of readings ?? []) {
              const id = (r as any).initiative_metric_id as string;
              if (!latest.has(id)) latest.set(id, (r as any).status_rag);
            }
            let critical = 0;
            for (const v of latest.values()) if (v === "off_track") critical++;
            next.H = `${critical} critical`;
          } else {
            next.H = "0 critical";
          }
        } else {
          next.H = "0 critical";
        }

        // E — over budget count
        if (initIds.length > 0) {
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
          const spendByInit = new Map<string, number>();
          for (const r of spend ?? []) {
            const id = (r as any).initiative_id as string;
            spendByInit.set(
              id,
              (spendByInit.get(id) ?? 0) + (Number((r as any).spend_amount) || 0),
            );
          }
          let over = 0;
          for (const b of budgets ?? []) {
            const id = (b as any).initiative_id as string;
            const bud = Number((b as any).approved_budget_mvp) || 0;
            if ((spendByInit.get(id) ?? 0) > bud) over++;
          }
          next.E = `${over} over budget`;
        } else {
          next.E = "0 over budget";
        }

        // N — KPIs linked
        if (initIds.length > 0) {
          const { count } = await supabase
            .from("initiative_metrics")
            .select("id", { count: "exact", head: true })
            .in("initiative_id", initIds)
            .eq("is_key_result", true)
            .not("linked_xmatrix_kpi_id", "is", null);
          next.N = `${count ?? 0} KPIs linked`;
        } else {
          next.N = "0 KPIs linked";
        }

        // I — pct outcome_hypothesis on track
        if (initIds.length > 0) {
          const { data: ohMetrics } = await supabase
            .from("initiative_metrics")
            .select("id")
            .in("initiative_id", initIds)
            .eq("metric_type", "outcome_hypothesis");
          const ids = (ohMetrics ?? []).map((r: any) => r.id);
          if (ids.length > 0) {
            const { data: readings } = await supabase
              .from("metric_readings")
              .select("initiative_metric_id, reading_date, status_rag")
              .in("initiative_metric_id", ids)
              .order("reading_date", { ascending: false });
            const latest = new Map<string, string | null>();
            for (const r of readings ?? []) {
              const id = (r as any).initiative_metric_id as string;
              if (!latest.has(id)) latest.set(id, (r as any).status_rag);
            }
            let on = 0;
            for (const id of ids) if (latest.get(id) === "on_track") on++;
            const pct = Math.round((100 * on) / ids.length);
            next.I = `${pct}% on track`;
          } else {
            next.I = "0% on track";
          }
        } else {
          next.I = "0% on track";
        }

        // X — active sprint
        const today = refDateIso;
        const { data: sprints } = await supabase
          .from("sprints")
          .select("name")
          .eq("client_id", CLIENT_ID)
          .eq("is_committed", true)
          .lte("start_date", today)
          .gte("end_date", today)
          .limit(1);
        const sprint = (sprints ?? [])[0] as { name?: string } | undefined;
        next.X = sprint?.name ? `${sprint.name} active` : "no active sprint";
      } catch (e) {
        console.error("[ExecutiveDashboard] stage badges error:", e);
      }

      if (!cancelled) setStageBadges(next);
    })();
  }, [refreshKey, refDateIso]);

  const selectedTileObj = useMemo(
    () => tileConfigs.find((t) => t.tile_key === selectedTile) ?? null,
    [tileConfigs, selectedTile],
  );

  const relatedNavKey = selectedTileObj?.navigator_link ?? null;

  const onNavClick = (key: string) => {
    if (selectedNav === key) {
      setSelectedNav(null);
      setSelectedTile(null);
    } else {
      setSelectedNav(key);
      setSelectedTile(null);
    }
  };

  const onTileClick = (key: string) => {
    if (selectedTile === key) {
      setSelectedNav(null);
      setSelectedTile(null);
    } else {
      setSelectedTile(key);
      setSelectedNav(null);
    }
  };

  const showConfigError =
    !!configError || (!tilesLoading && tileConfigs.length === 0);

  const stageWordOf = (k: string) =>
    STAGES.find((s) => s.key === k)?.word ?? null;

  return (
    <div className="bg-muted/30 -m-4 md:-m-6 p-4 min-h-full flex flex-col gap-3">
      {/* ZONE 1: Top bar */}
      <div className="bg-white border border-border rounded-xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="bg-[#1B4F72] text-white text-[10px] font-medium px-2 py-0.5 rounded">
            PHOENIX
          </span>
          <span className="text-sm font-medium">Executive Dashboard</span>
          {settingsLoading ? (
            <Skeleton className="w-32 h-3" />
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {settings?.portfolio_display_name ?? "—"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pi && (
            <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2 py-0.5 rounded">
              {pi.name} · {format(new Date(pi.start_date), "MMM yyyy")} –{" "}
              {format(new Date(pi.end_date), "MMM yyyy")}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {format(referenceDate, "d MMM yyyy")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Refresh"
          >
            <RefreshCw size={14} className="text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* ZONE 2: PHOENIX navigator strip */}
      <div className="bg-white border border-border rounded-xl p-3">
        <div className="flex items-center gap-1 mb-2">
          <Flame size={10} className="text-[#1B4F72]" />
          <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
            PHOENIX framework navigator
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {STAGES.map((s) => {
            const isSelected = selectedNav === s.key;
            const isRelated = relatedNavKey === s.key && !isSelected;
            return (
              <button
                key={s.key}
                onClick={() => onNavClick(s.key)}
                className={[
                  "border rounded-lg py-2 px-1 cursor-pointer text-center bg-muted/50 transition-all w-full flex flex-col items-center gap-0",
                  isSelected
                    ? "border-2 border-[#1B4F72] bg-blue-50/60"
                    : isRelated
                      ? "border border-dashed border-emerald-400 bg-emerald-50/30"
                      : "border-border hover:border-[#1B4F72]/40",
                ].join(" ")}
              >
                <span className="text-2xl font-medium text-[#1B4F72] leading-none">
                  {s.key}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 leading-tight text-center px-0.5">
                  {s.word}
                </span>
                <span
                  className={`text-[10px] font-medium px-1.5 py-px rounded mt-1.5 ${s.badgeClass}`}
                >
                  {stageBadges[s.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ZONE 3: Tile grid */}
      <div className="bg-white border border-border rounded-xl p-3">
        <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Portfolio summary · select a card to explore
        </div>
        {showConfigError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>
                Dashboard configuration unavailable. Please contact your
                administrator.
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setRefreshKey((k) => k + 1)}
              >
                <RefreshCw size={14} />
              </Button>
            </AlertDescription>
          </Alert>
        ) : tilesLoading ? (
          <div className="grid gap-2 grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${tileConfigs.length}, minmax(0, 1fr))`,
            }}
          >
            {tileConfigs.map((tile) => {
              const isSelected = selectedTile === tile.tile_key;
              const isRelated =
                selectedNav != null &&
                tile.navigator_link === selectedNav &&
                !isSelected;
              return (
                <TileCard
                  key={tile.tile_key}
                  tile={tile}
                  isSelected={isSelected}
                  isRelated={isRelated}
                  onClick={() => onTileClick(tile.tile_key)}
                  clientId={CLIENT_ID}
                  refreshKey={refreshKey}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ZONE 4: Drill-down */}
      <div className="bg-white border border-border rounded-xl p-3 min-h-[100px]">
        {selectedNav == null && selectedTile == null ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground/40 py-6 gap-1">
            <MousePointerClick size={18} />
            <span className="text-xs">
              Select a framework stage or summary card to explore detail
            </span>
          </div>
        ) : (
          <DrillDownPanel
            selectedNav={selectedNav}
            selectedTile={selectedTile}
            clientId={CLIENT_ID}
            settings={settings}
            tile={selectedTileObj}
            navLabel={selectedNav ? stageWordOf(selectedNav) : null}
            onClose={() => {
              setSelectedNav(null);
              setSelectedTile(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
