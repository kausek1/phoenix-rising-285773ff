import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Settings as SettingsIcon, Plus } from "lucide-react";

interface TeamRecord {
  id: string;
  client_id: string;
  initiative_id: string;
  team_name: string;
  team_coach: string | null;
  product_owner: string | null;
  initiative: { title: string; display_id: number | null } | null;
}

interface FeatureLite {
  id: string;
  feature_type: "mvp" | "post_mvp";
  title: string;
  sort_order: number | null;
}

interface BoardFeatureRow {
  id: string;
  team_id: string;
  feature_id: string;
  client_id: string;
  size_estimate_days: number | null;
  pulled_at: string;
  feature: FeatureLite | null;
}

interface WipLimits {
  define: number;
  build: number;
  test: number;
}

const COLUMNS: { key: string; label: string; wipKey?: keyof WipLimits }[] = [
  { key: "feature", label: "Feature" },
  { key: "backlog", label: "Backlog" },
  { key: "define", label: "Define", wipKey: "define" },
  { key: "build", label: "Build", wipKey: "build" },
  { key: "test", label: "Test", wipKey: "test" },
  { key: "deploy", label: "Deploy" },
  { key: "done", label: "Done" },
];

function lbcLabel(displayId: number | null | undefined): string {
  if (displayId == null) return "LBC-—";
  return "LBC-" + String(displayId).padStart(3, "0");
}

export default function TeamKanbanBoard({ teamId }: { teamId: string }) {
  const { clientId } = useAuth();
  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [wip, setWip] = useState<WipLimits>({ define: 3, build: 5, test: 3 });
  const [boardFeatures, setBoardFeatures] = useState<BoardFeatureRow[]>([]);
  const [allFeatures, setAllFeatures] = useState<FeatureLite[]>([]);
  const [pullSelection, setPullSelection] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const load = useCallback(async () => {
    if (!clientId || !teamId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: tData, error: tErr } = await supabase
        .from("kanban_teams")
        .select(
          "id, client_id, initiative_id, team_name, team_coach, product_owner, initiatives(title, display_id)",
        )
        .eq("id", teamId)
        .eq("client_id", clientId)
        .single();
      if (tErr) throw tErr;
      const teamRec: TeamRecord = {
        id: (tData as any).id,
        client_id: (tData as any).client_id,
        initiative_id: (tData as any).initiative_id,
        team_name: (tData as any).team_name,
        team_coach: (tData as any).team_coach,
        product_owner: (tData as any).product_owner,
        initiative: (tData as any).initiatives
          ? {
              title: (tData as any).initiatives.title,
              display_id: (tData as any).initiatives.display_id,
            }
          : null,
      };
      setTeam(teamRec);

      const [{ data: wData }, { data: bfData }, { data: fData }] = await Promise.all([
        supabase
          .from("team_wip_limits")
          .select("stage, wip_limit")
          .eq("team_id", teamId),
        supabase
          .from("kanban_board_features")
          .select(
            "id, team_id, feature_id, client_id, size_estimate_days, pulled_at, features(id, feature_type, title, sort_order)",
          )
          .eq("team_id", teamId)
          .eq("client_id", clientId)
          .order("pulled_at", { ascending: true }),
        supabase
          .from("features")
          .select("id, feature_type, title, sort_order")
          .eq("client_id", clientId)
          .eq("initiative_id", teamRec.initiative_id)
          .order("feature_type")
          .order("sort_order"),
      ]);

      const nextWip: WipLimits = { define: 3, build: 5, test: 3 };
      (wData ?? []).forEach((r: any) => {
        if (r.stage === "define" || r.stage === "build" || r.stage === "test") {
          nextWip[r.stage as keyof WipLimits] = r.wip_limit;
        }
      });
      setWip(nextWip);

      const bfMapped: BoardFeatureRow[] = (bfData ?? []).map((r: any) => ({
        id: r.id,
        team_id: r.team_id,
        feature_id: r.feature_id,
        client_id: r.client_id,
        size_estimate_days: r.size_estimate_days,
        pulled_at: r.pulled_at,
        feature: r.features
          ? {
              id: r.features.id,
              feature_type: r.features.feature_type,
              title: r.features.title,
              sort_order: r.features.sort_order,
            }
          : null,
      }));
      setBoardFeatures(bfMapped);
      setAllFeatures((fData as FeatureLite[]) ?? []);
    } catch (e: any) {
      console.error("[TeamKanbanBoard] load error:", e);
      setError(e?.message ?? "Failed to load board");
    } finally {
      setLoading(false);
    }
  }, [clientId, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pulledIds = useMemo(
    () => new Set(boardFeatures.map((b) => b.feature_id)),
    [boardFeatures],
  );
  const availableFeatures = useMemo(
    () => allFeatures.filter((f) => !pulledIds.has(f.id)),
    [allFeatures, pulledIds],
  );
  const mvpAvailable = availableFeatures.filter((f) => f.feature_type === "mvp");
  const postAvailable = availableFeatures.filter((f) => f.feature_type === "post_mvp");

  const handlePull = async () => {
    if (!pullSelection || !clientId || !team) return;
    setPulling(true);
    try {
      const { error: insErr } = await supabase.from("kanban_board_features").insert({
        team_id: team.id,
        feature_id: pullSelection,
        client_id: clientId,
      });
      if (insErr) throw insErr;
      toast.success("Feature pulled onto board");
      setPullSelection("");
      await load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to pull feature");
    } finally {
      setPulling(false);
    }
  };

  const handleSizeChange = async (rowId: string, value: number | null) => {
    try {
      const { error: uErr } = await supabase
        .from("kanban_board_features")
        .update({ size_estimate_days: value })
        .eq("id", rowId);
      if (uErr) throw uErr;
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to save size estimate");
      void load();
    }
  };

  if (loading) {
    return <p className="text-muted-foreground p-6">Loading board…</p>;
  }
  if (error || !team) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-destructive">Failed to load team board: {error ?? "Not found"}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const lbc = lbcLabel(team.initiative?.display_id);
  const showPolicyWarning = boardFeatures.length >= 2;
  const allPulled = availableFeatures.length === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 border-b pb-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-primary">
            {team.team_name} <span className="text-muted-foreground">— {lbc}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {team.initiative?.title ?? "No initiative"}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Team Coach:</span>{" "}
            <span className="font-medium">{team.team_coach ?? "—"}</span>
            <span className="mx-3 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Product Owner:</span>{" "}
            <span className="font-medium">{team.product_owner ?? "—"}</span>
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/settings">
            <SettingsIcon className="h-4 w-4 mr-2" />
            Team Page
          </Link>
        </Button>
      </div>

      {/* Pull control */}
      <div className="rounded-md border bg-card p-3 space-y-2">
        {allPulled ? (
          <p className="text-sm text-muted-foreground">All features are on the board.</p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Select value={pullSelection} onValueChange={setPullSelection}>
                <SelectTrigger className="sm:max-w-md">
                  <SelectValue placeholder="Pull Feature onto Board" />
                </SelectTrigger>
                <SelectContent>
                  {mvpAvailable.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>MVP</SelectLabel>
                      {mvpAvailable.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {postAvailable.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Post-MVP</SelectLabel>
                      {postAvailable.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              <Button onClick={handlePull} disabled={!pullSelection || pulling}>
                <Plus className="h-4 w-4 mr-1" />
                Pull
              </Button>
            </div>
            {showPolicyWarning && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                Policy recommends a maximum of 2 active features. Consider completing a feature
                before pulling a new one.
              </p>
            )}
          </>
        )}
      </div>

      {/* Board */}
      <div className="overflow-x-auto border rounded-md bg-card">
        <div className="min-w-[1200px]">
          {/* Header row */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] bg-muted/50 border-b">
            {COLUMNS.map((c) => (
              <div key={c.key} className="px-3 py-2 border-r last:border-r-0">
                <div className="text-sm font-semibold text-primary">{c.label}</div>
                {c.wipKey && (
                  <Badge variant="secondary" className="mt-1 text-[10px] font-normal">
                    Limit: {wip[c.wipKey]}
                  </Badge>
                )}
              </div>
            ))}
          </div>

          {/* Swimlanes */}
          {boardFeatures.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No features on the board yet. Use the pull feature control above to add your first
              feature.
            </div>
          ) : (
            boardFeatures.map((bf, idx) => (
              <div
                key={bf.id}
                className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b last:border-b-0 ${
                  idx % 2 === 1 ? "bg-muted/20" : ""
                }`}
              >
                {/* Feature column */}
                <div className="px-3 py-3 border-r min-h-[160px]">
                  <FeatureCard
                    boardFeature={bf}
                    lbcDisplayId={team.initiative?.display_id ?? null}
                    onSizeChange={handleSizeChange}
                  />
                </div>
                {/* Empty story columns (Prompt 2B) */}
                {COLUMNS.slice(1).map((c) => (
                  <div key={c.key} className="px-2 py-3 border-r last:border-r-0 min-h-[160px]" />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  boardFeature,
  lbcDisplayId,
  onSizeChange,
}: {
  boardFeature: BoardFeatureRow;
  lbcDisplayId: number | null;
  onSizeChange: (id: string, value: number | null) => void | Promise<void>;
}) {
  const [size, setSize] = useState<string>(
    boardFeature.size_estimate_days != null ? String(boardFeature.size_estimate_days) : "",
  );
  const f = boardFeature.feature;
  const lbcPart =
    lbcDisplayId != null ? String(lbcDisplayId).padStart(3, "0") : "—";
  const featureCode = `${lbcPart}-F${f?.sort_order ?? "?"}`;

  return (
    <div
      className="rounded-md border-2 border-blue-200 p-3 space-y-2 shadow-sm"
      style={{ backgroundColor: "#DBEAFE" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono font-semibold text-blue-900">{featureCode}</span>
        <Badge
          className="text-[10px] font-semibold"
          variant={f?.feature_type === "mvp" ? "default" : "secondary"}
        >
          {f?.feature_type === "mvp" ? "MVP" : "Post-MVP"}
        </Badge>
      </div>
      <div className="text-sm font-semibold text-primary leading-tight">
        {f?.title ?? "(Untitled feature)"}
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Est. Size (team days)
        </label>
        <Input
          type="number"
          min={0}
          value={size}
          onChange={(e) => setSize(e.target.value)}
          onBlur={() => {
            const parsed = size === "" ? null : Number(size);
            if (parsed != null && Number.isNaN(parsed)) return;
            if (parsed === boardFeature.size_estimate_days) return;
            void onSizeChange(boardFeature.id, parsed);
          }}
          className="h-8 text-sm bg-white"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full bg-white"
        onClick={() => {
          /* wired in Prompt 2B */
        }}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add Story
      </Button>
    </div>
  );
}
