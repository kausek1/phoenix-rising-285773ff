import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Plus,
  AlertTriangle,
  Calendar as CalendarIcon,
  CalendarDays,
  BarChart2,
  Trash2,
  CheckCircle2,
  MoreVertical,
  Undo2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SprintPlanningPanel } from "./SprintPlanningPanel";
import { SprintHealthPanel } from "./SprintHealthPanel";
import { MetricsPanel } from "./MetricsPanel";

interface ActivePI { id: string; name: string; }
interface ActiveSprint {
  id: string; name: string; sprint_number: number | null;
  start_date: string; end_date: string;
}

function parseDateOnly(s: string): Date {
  // s is "YYYY-MM-DD"; parse as local date to avoid UTC shift
  const [y, m, d] = s.split("T")[0].split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatSprintRange(s: ActiveSprint): string {
  try {
    const start = parseDateOnly(s.start_date);
    const end = parseDateOnly(s.end_date);
    const sameMonth =
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth();
    const sameYear = start.getFullYear() === end.getFullYear();
    const startStr = format(start, "MMM d");
    const endStr = sameMonth
      ? format(end, "d, yyyy")
      : sameYear
        ? format(end, "MMM d, yyyy")
        : format(end, "MMM d, yyyy");
    return `Sprint ${s.sprint_number ?? ""} — ${startStr}–${endStr}`.replace("Sprint  —", "Sprint —");
  } catch {
    return s.name;
  }
}
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { StoryDetailPanel, FeatureDetailPanel } from "./StoryDetailPanel";

type Stage = "feature" | "backlog" | "define" | "build" | "test" | "deploy" | "done";

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
  status: "backlog" | "in_progress" | "done" | "cancelled";
  duration_months: number | null;
}


interface BoardFeatureRow {
  id: string;
  team_id: string;
  feature_id: string;
  client_id: string;
  size_estimate_days: number | null;
  pulled_at: string;
  feature_sequence: number | null;
  feature: FeatureLite | null;
}

interface StoryRow {
  id: string;
  client_id: string;
  team_id: string;
  board_feature_id: string;
  story_type: "team" | "contractor";
  name: string;
  stage: Stage;
  owner_initials: string | null;
  size_estimate_days: number | null;
  contractor_name: string | null;
  due_date: string | null;
  display_id: string | null;
  sequence_number: number | null;
  sort_order: number | null;
  sprint_id: string | null;
  acceptance_criteria: string | null;
}

interface TeamMemberLite {
  id: string;
  initials: string;
  full_name: string;
  profile_id: string | null;
}

interface WipLimits {
  define: number;
  build: number;
  test: number;
}

const COLUMNS: { key: Stage; label: string; wipKey?: keyof WipLimits }[] = [
  { key: "feature", label: "Feature" },
  { key: "backlog", label: "Backlog" },
  { key: "define", label: "Define", wipKey: "define" },
  { key: "build", label: "Build/Do", wipKey: "build" },
  { key: "test", label: "Test/Review", wipKey: "test" },
  { key: "deploy", label: "Deploy" },
  { key: "done", label: "Done" },
];

function lbcLabel(displayId: number | null | undefined): string {
  if (displayId == null) return "LBC-—";
  return "LBC-" + String(displayId).padStart(3, "0");
}

export default function TeamKanbanBoard({ teamId }: { teamId: string }) {
  const { clientId, role, profile } = useAuth();
  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [wip, setWip] = useState<WipLimits>({ define: 3, build: 5, test: 3 });
  const [boardFeatures, setBoardFeatures] = useState<BoardFeatureRow[]>([]);
  const [allFeatures, setAllFeatures] = useState<FeatureLite[]>([]);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [members, setMembers] = useState<TeamMemberLite[]>([]);
  const [pullSelection, setPullSelection] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [addStoryFor, setAddStoryFor] = useState<BoardFeatureRow | null>(null);
  const [detailStory, setDetailStory] = useState<StoryRow | null>(null);
  const [detailBoardFeature, setDetailBoardFeature] = useState<BoardFeatureRow | null>(null);
  const [detailFeature, setDetailFeature] = useState<BoardFeatureRow | null>(null);
  const [activePI, setActivePI] = useState<ActivePI | null>(null);
  const [activeSprint, setActiveSprint] = useState<ActiveSprint | null>(null);
  const [sprints, setSprints] = useState<{ id: string; name: string; sprint_number: number | null }[]>([]);
  const [sprintPanelOpen, setSprintPanelOpen] = useState(false);
  const [healthRefreshKey, setHealthRefreshKey] = useState(0);
  const [metricsPanelOpen, setMetricsPanelOpen] = useState(false);
  const [showDelivered, setShowDelivered] = useState(false);
  const [deliverTarget, setDeliverTarget] = useState<BoardFeatureRow | null>(null);
  const [deliverPendingCount, setDeliverPendingCount] = useState<number>(0);
  const [delivering, setDelivering] = useState(false);
  const [returnTarget, setReturnTarget] = useState<BoardFeatureRow | null>(null);
  const [returning, setReturning] = useState(false);

  const isManager = role === "admin" || role === "contributor";

  // Load all data
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

      const [
        { data: wData },
        { data: bfData },
        { data: fData },
        { data: sData },
        { data: mData },
      ] = await Promise.all([
        supabase
          .from("team_wip_limits")
          .select("stage, wip_limit")
          .eq("team_id", teamId),
        supabase
          .from("kanban_board_features")
          .select(
            "id, team_id, feature_id, client_id, size_estimate_days, pulled_at, feature_sequence, features(id, feature_type, title, sort_order, status, duration_months)",
          )
          .eq("team_id", teamId)
          .eq("client_id", clientId)
          .order("pulled_at", { ascending: true }),
        supabase
          .from("features")
          .select("id, feature_type, title, sort_order, status, duration_months")
          .eq("client_id", clientId)
          .eq("initiative_id", teamRec.initiative_id)
          .order("feature_type")
          .order("sort_order"),
        supabase
          .from("kanban_stories")
          .select(
            "id, client_id, team_id, board_feature_id, story_type, name, stage, owner_initials, size_estimate_days, contractor_name, due_date, display_id, sequence_number, sort_order, sprint_id, acceptance_criteria",
          )
          .eq("team_id", teamId)
          .eq("client_id", clientId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("team_members")
          .select("id, initials, full_name, profile_id")
          .eq("team_id", teamId)
          .order("full_name"),
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
        feature_sequence: r.feature_sequence ?? null,
        feature: r.features
          ? {
              id: r.features.id,
              feature_type: r.features.feature_type,
              title: r.features.title,
              sort_order: r.features.sort_order,
              status: r.features.status,
              duration_months: r.features.duration_months ?? null,
            }
          : null,

      }));
      setBoardFeatures(bfMapped);
      setAllFeatures((fData as FeatureLite[]) ?? []);
      setStories((sData as StoryRow[]) ?? []);
      setMembers(
        ((mData as any[]) ?? []).map((r) => ({
          id: r.id,
          initials: r.initials ?? "",
          full_name: r.full_name ?? "",
          profile_id: r.profile_id ?? null,
        })),
      );
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

  // Load active Planning Increment + active Sprint
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const { data: piRows } = await supabase
        .from("planning_increments")
        .select("id, name")
        .eq("client_id", clientId)
        .eq("status", "active")
        .limit(1);
      const pi = (piRows ?? [])[0] as ActivePI | undefined;
      if (cancelled) return;
      if (!pi) { setActivePI(null); setActiveSprint(null); return; }
      setActivePI(pi);
      const { data: spRows } = await supabase
        .from("sprints")
        .select("id, name, sprint_number, start_date, end_date")
        .eq("client_id", clientId)
        .eq("planning_increment_id", pi.id)
        .eq("status", "active")
        .limit(1);
      if (cancelled) return;
      setActiveSprint(((spRows ?? [])[0] as ActiveSprint | undefined) ?? null);

      const { data: allSp } = await supabase
        .from("sprints")
        .select("id, name, sprint_number, start_date")
        .eq("client_id", clientId)
        .eq("planning_increment_id", pi.id)
        .order("start_date", { ascending: true });
      if (cancelled) return;
      setSprints(((allSp as any[]) ?? []).map((r) => ({
        id: r.id, name: r.name, sprint_number: r.sprint_number ?? null,
      })));
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  // Access control: admins, or team_members rows with non-null profile_id matching this user
  const canEdit = useMemo(() => {
    if (role === "admin") return true;
    if (!profile?.id) return false;
    return members.some((m) => m.profile_id === profile.id);
  }, [role, profile?.id, members]);

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

  // Stable per-initiative feature numbering (matches FeaturesTab): within each
  // feature_type group, features are numbered 1..n by sort_order. Used as the
  // F# label on cards so the identifier reflects the feature's stored position
  // in the LBC rather than the board-pull order (feature_sequence).
  const featureNumberById = useMemo(() => {
    const map = new Map<string, number>();
    const groups = new Map<string, FeatureLite[]>();
    [...allFeatures]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .forEach((f) => {
        const key = f.feature_type ?? "_";
        const list = groups.get(key) ?? [];
        list.push(f);
        groups.set(key, list);
      });
    groups.forEach((list) => {
      list.forEach((f, i) => map.set(f.id, i + 1));
    });
    return map;
  }, [allFeatures]);

  // Story counts per stage (for WIP)
  const stageCounts = useMemo(() => {
    const c: Record<Stage, number> = {
      feature: 0, backlog: 0, define: 0, build: 0, test: 0, deploy: 0, done: 0,
    };
    stories.forEach((s) => { c[s.stage] = (c[s.stage] ?? 0) + 1; });
    return c;
  }, [stories]);

  // Group stories by board_feature_id then stage
  const storiesBySwimlane = useMemo(() => {
    const map: Record<string, Record<Stage, StoryRow[]>> = {};
    boardFeatures.forEach((bf) => {
      map[bf.id] = {
        feature: [], backlog: [], define: [], build: [], test: [], deploy: [], done: [],
      };
    });
    stories.forEach((s) => {
      if (!map[s.board_feature_id]) return;
      map[s.board_feature_id][s.stage].push(s);
    });
    // Sort each lane by sort_order ascending
    Object.values(map).forEach((stages) => {
      (Object.keys(stages) as Stage[]).forEach((stage) => {
        stages[stage].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      });
    });
    return map;
  }, [stories, boardFeatures]);

  const activeBoardFeatures = useMemo(
    () => boardFeatures.filter((bf) => {
      const s = bf.feature?.status;
      return s === "backlog" || s === "in_progress" || s == null;
    }),
    [boardFeatures],
  );
  const deliveredBoardFeatures = useMemo(
    () => boardFeatures.filter((bf) => bf.feature?.status === "done"),
    [boardFeatures],
  );

  const openDeliverDialog = async (bf: BoardFeatureRow) => {
    const { count } = await supabase
      .from("kanban_stories")
      .select("id", { count: "exact", head: true })
      .eq("board_feature_id", bf.id)
      .neq("stage", "done");
    setDeliverPendingCount(count ?? 0);
    setDeliverTarget(bf);
  };

  const confirmDeliver = async () => {
    if (!deliverTarget?.feature) return;
    setDelivering(true);
    const title = deliverTarget.feature.title;
    const { error: uErr } = await supabase
      .from("features")
      .update({ status: "done" })
      .eq("id", deliverTarget.feature_id);
    setDelivering(false);
    if (uErr) {
      toast.error(uErr.message ?? "Failed to mark as delivered");
      return;
    }
    setBoardFeatures((prev) =>
      prev.map((b) =>
        b.id === deliverTarget.id && b.feature
          ? { ...b, feature: { ...b.feature, status: "done" } }
          : b,
      ),
    );
    setAllFeatures((prev) =>
      prev.map((f) => (f.id === deliverTarget.feature_id ? { ...f, status: "done" } : f)),
    );
    toast.success(`${title} marked as Delivered`);
    setDeliverTarget(null);
  };

  const confirmReturn = async () => {
    if (!returnTarget?.feature) return;
    setReturning(true);
    const title = returnTarget.feature.title;
    const featureId = returnTarget.feature_id;
    const bfId = returnTarget.id;
    const { error: uErr } = await supabase
      .from("features")
      .update({ status: "backlog" })
      .eq("id", featureId);
    if (uErr) {
      setReturning(false);
      toast.error(uErr.message ?? "Failed to return to backlog");
      return;
    }
    const { error: dErr } = await supabase
      .from("kanban_board_features")
      .delete()
      .eq("id", bfId);
    setReturning(false);
    if (dErr) {
      toast.error(dErr.message ?? "Failed to remove from board");
      return;
    }
    setBoardFeatures((prev) => prev.filter((b) => b.id !== bfId));
    setAllFeatures((prev) =>
      prev.map((f) => (f.id === featureId ? { ...f, status: "backlog" } : f)),
    );
    toast.success(`${title} returned to backlog`);
    setReturnTarget(null);
  };

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

  // Drag-and-drop handler
  const onDragEnd = async (result: DropResult) => {
    if (!canEdit) return;
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // droppableId format: "{boardFeatureId}::{stage}"
    const [destBf, destStage] = destination.droppableId.split("::");
    const [srcBf, srcStage] = source.droppableId.split("::");
    if (destBf !== srcBf) return; // safety: can't cross swimlanes

    const story = stories.find((s) => s.id === draggableId);
    if (!story) return;
    const prevStories = stories;

    // Same-column reorder
    if (source.droppableId === destination.droppableId) {
      const lane = stories
        .filter((s) => s.board_feature_id === destBf && s.stage === (destStage as Stage))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const reordered = [...lane];
      const [moved] = reordered.splice(source.index, 1);
      if (!moved) return;
      reordered.splice(destination.index, 0, moved);

      const updates = reordered.map((s, i) => ({ id: s.id, sort_order: i * 10 }));
      const updateMap = new Map(updates.map((u) => [u.id, u.sort_order]));

      setStories((prev) =>
        prev.map((s) =>
          updateMap.has(s.id) ? { ...s, sort_order: updateMap.get(s.id)! } : s,
        ),
      );

      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("kanban_stories").update({ sort_order: u.sort_order }).eq("id", u.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        console.error(failed.error);
        toast.error(failed.error.message ?? "Failed to reorder stories");
        setStories(prevStories);
      }
      return;
    }

    // Cross-stage move (within same swimlane)
    const newStage = destStage as Stage;
    const newSortOrder = destination.index * 10;

    // Optimistic update
    setStories((prev) =>
      prev.map((s) =>
        s.id === draggableId ? { ...s, stage: newStage, sort_order: newSortOrder } : s,
      ),
    );

    const { error: uErr } = await supabase
      .from("kanban_stories")
      .update({ stage: newStage, sort_order: newSortOrder })
      .eq("id", draggableId);
    if (uErr) {
      console.error(uErr);
      toast.error(uErr.message ?? "Failed to move story");
      setStories(prevStories);
    } else if (newStage === "done" || srcStage === "done") {
      setHealthRefreshKey((k) => k + 1);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    const { error: dErr } = await supabase
      .from("kanban_stories")
      .delete()
      .eq("id", storyId);
    if (dErr) {
      toast.error(dErr.message ?? "Failed to delete story");
      return false;
    }
    setStories((prev) => prev.filter((s) => s.id !== storyId));
    toast.success("Story deleted");
    return true;
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
  const showPolicyWarning = activeBoardFeatures.length >= 2;
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
        <div className="flex items-center gap-2">
          {activePI && activeSprint && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium"
              style={{ background: "#E0F2FE", color: "#0F2A4A" }}
            >
              {activePI.name} · {formatSprintRange(activeSprint)}
            </span>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Switch checked={showDelivered} onCheckedChange={setShowDelivered} />
            Show Delivered
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSprintPanelOpen(true)}
            className="border-primary text-primary hover:bg-primary/5"
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            Sprint Planning
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMetricsPanelOpen(true)}
            className="border-primary text-primary hover:bg-primary/5"
          >
            <BarChart2 className="h-4 w-4 mr-2" />
            Metrics
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">
              <SettingsIcon className="h-4 w-4 mr-2" />
              Team Page
            </Link>
          </Button>
        </div>
      </div>

      {team && (
        <SprintPlanningPanel
          open={sprintPanelOpen}
          onClose={() => { setSprintPanelOpen(false); setHealthRefreshKey((k) => k + 1); }}
          clientId={clientId ?? ""}
          initiativeId={team.initiative_id}
          pi={activePI}
          sprint={activeSprint}
          sprintLabel={activeSprint ? formatSprintRange(activeSprint) : ""}
        />
      )}

      {team && (
        <MetricsPanel
          open={metricsPanelOpen}
          onClose={() => { setMetricsPanelOpen(false); setHealthRefreshKey((k) => k + 1); }}
          clientId={clientId ?? ""}
          initiativeId={team.initiative_id}
          initiativeDisplayId={team.initiative?.display_id ?? null}
          initiativeTitle={team.initiative?.title ?? ""}
        />
      )}

      <SprintHealthPanel
        clientId={clientId ?? ""}
        sprint={activeSprint}
        refreshKey={healthRefreshKey}
      />

      {/* Pull control */}
      {canEdit && (
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
      )}

      {/* Board — only the swimlane area scrolls horizontally */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div
          className="border rounded-md bg-card"
          style={{
            overflowX: "auto",
            overflowY: "visible",
            maxHeight: "calc(100vh - 360px)",
          }}
        >
          <div className="min-w-[1600px]">
            {/* Header row */}
            <div className="grid grid-cols-7 bg-muted/50 border-b sticky top-0 z-10">
                  {COLUMNS.map((c) => {
                    const limit = c.wipKey ? wip[c.wipKey] : null;
                    const count = stageCounts[c.key] ?? 0;
                    const overLimit = limit != null && count >= limit;
                    return (
                      <div key={c.key} className="px-3 py-2 border-r last:border-r-0">
                        <div
                          className={cn(
                            "text-sm font-semibold flex items-center gap-1.5",
                            overLimit ? "text-amber-700" : "text-primary",
                          )}
                        >
                          {c.label}
                          {limit != null && (
                            <span className={cn("text-xs", overLimit ? "text-amber-700" : "text-muted-foreground")}>
                              {count}/{limit}
                            </span>
                          )}
                          {overLimit && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Swimlanes */}
                {activeBoardFeatures.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    No features on the board yet. Use the pull feature control above to add your first
                    feature.
                  </div>
                ) : (
                  activeBoardFeatures.map((bf, idx) => {
                    const lanes = storiesBySwimlane[bf.id];
                    return (
                      <div
                        key={bf.id}
                        className={cn(
                          "grid grid-cols-7 border-b last:border-b-0",
                          idx % 2 === 1 ? "bg-muted/20" : "",
                        )}
                      >
                        {/* Feature column */}
                        <div className="px-3 py-3 border-r min-h-[200px] space-y-2">
                          <FeatureCard
                            boardFeature={bf}
                            lbcDisplayId={team.initiative?.display_id ?? null}
                            featureNumber={featureNumberById.get(bf.feature_id) ?? null}
                            onSizeChange={handleSizeChange}
                            onAddStory={() => setAddStoryFor(bf)}
                            onOpen={() => setDetailFeature(bf)}
                            canEdit={canEdit}
                            isManager={isManager}
                            onMarkDelivered={() => void openDeliverDialog(bf)}
                            onReturnToBacklog={() => setReturnTarget(bf)}
                          />
                          <Droppable
                            droppableId={`${bf.id}::feature`}
                            isDropDisabled={!canEdit}
                          >
                            {(dropProvided, snapshot) => (
                              <div
                                ref={dropProvided.innerRef}
                                {...dropProvided.droppableProps}
                                className={cn(
                                  "space-y-2 pt-2 transition-colors rounded",
                                  snapshot.isDraggingOver ? "bg-blue-50" : "",
                                )}
                              >
                                {(lanes?.feature ?? []).map((s, i) => (
                                  <Draggable
                                    draggableId={s.id}
                                    index={i}
                                    key={s.id}
                                    isDragDisabled={!canEdit}
                                  >
                                    {(dragProvided, dragSnap) => (
                                      <div
                                        ref={dragProvided.innerRef}
                                        {...dragProvided.draggableProps}
                                        {...dragProvided.dragHandleProps}
                                        className={cn(dragSnap.isDragging && "opacity-90")}
                                      >
                                        <StoryCard
                                          story={s}
                                          canEdit={canEdit}
                                          onDelete={handleDeleteStory}
                                          onOpen={() => {
                                            setDetailStory(s);
                                            setDetailBoardFeature(bf);
                                          }}
                                        />
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {dropProvided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </div>
                        {/* Story columns */}
                        {COLUMNS.slice(1).map((c) => {
                          const droppableId = `${bf.id}::${c.key}`;
                          const lane = lanes?.[c.key] ?? [];
                          return (
                            <Droppable
                              droppableId={droppableId}
                              key={c.key}
                              isDropDisabled={!canEdit}
                            >
                              {(dropProvided, snapshot) => (
                                <div
                                  ref={dropProvided.innerRef}
                                  {...dropProvided.droppableProps}
                                  className={cn(
                                    "px-2 py-2 border-r last:border-r-0 min-h-[200px] space-y-2 transition-colors",
                                    snapshot.isDraggingOver ? "bg-blue-50" : "",
                                  )}
                                >
                                  {lane.map((s, i) => (
                                    <Draggable
                                      draggableId={s.id}
                                      index={i}
                                      key={s.id}
                                      isDragDisabled={!canEdit}
                                    >
                                      {(dragProvided, dragSnap) => (
                                        <div
                                          ref={dragProvided.innerRef}
                                          {...dragProvided.draggableProps}
                                          {...dragProvided.dragHandleProps}
                                          className={cn(dragSnap.isDragging && "opacity-90")}
                                        >
                                          <StoryCard
                                            story={s}
                                            canEdit={canEdit}
                                            onDelete={handleDeleteStory}
                                            onOpen={() => {
                                              setDetailStory(s);
                                              setDetailBoardFeature(bf);
                                            }}
                                          />
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {dropProvided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </DragDropContext>

      {showDelivered && deliveredBoardFeatures.length > 0 && (
        <div className="border rounded-md bg-muted/30 p-4 space-y-3 opacity-90">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">
              Delivered Features ({deliveredBoardFeatures.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {deliveredBoardFeatures.map((bf) => {
              const f = bf.feature;
              const lbcPart = team.initiative?.display_id != null
                ? String(team.initiative.display_id).padStart(3, "0")
                : "—";
              const fSeq = featureNumberById.get(bf.feature_id) ?? bf.feature_sequence ?? f?.sort_order ?? "?";
              return (
                <div
                  key={bf.id}
                  className="rounded-md border border-dashed border-muted-foreground/30 bg-background/60 p-3 space-y-1 text-muted-foreground"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold">{lbcPart}-F{fSeq}</span>
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Delivered
                    </Badge>
                  </div>
                  <div className="text-sm font-medium leading-tight line-through">
                    {f?.title ?? "(Untitled feature)"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mark as Delivered confirmation */}
      <AlertDialog
        open={!!deliverTarget}
        onOpenChange={(v) => { if (!v) setDeliverTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Delivered</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">
                {deliverTarget?.feature?.title ?? "Feature"}
              </span>
              <br />
              {deliverPendingCount === 0
                ? "All stories complete. Ready to mark as Delivered."
                : `${deliverPendingCount} stories are not yet Done. Mark as Delivered anyway?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delivering}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={delivering}
              onClick={(e) => { e.preventDefault(); void confirmDeliver(); }}
            >
              {delivering ? "Saving…" : "Confirm Delivery"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Return to Backlog confirmation */}
      <AlertDialog
        open={!!returnTarget}
        onOpenChange={(v) => { if (!v) setReturnTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return to Backlog</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <span className="font-medium text-foreground">{returnTarget?.feature?.title ?? "this feature"}</span> from the board and return it to the backlog?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={returning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={returning}
              onClick={(e) => { e.preventDefault(); void confirmReturn(); }}
            >
              {returning ? "Removing…" : "Return to Backlog"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Story Modal */}
      {addStoryFor && (
        <AddStoryModal
          open={!!addStoryFor}
          onClose={() => setAddStoryFor(null)}
          boardFeature={addStoryFor}
          lbcDisplayId={team.initiative?.display_id ?? null}
          featureNumber={featureNumberById.get(addStoryFor.feature_id) ?? null}
          members={members}
          clientId={clientId!}
          teamId={team.id}
          onSaved={async () => {
            try {
              setAddStoryFor(null);
              const { data: sData } = await supabase
                .from("kanban_stories")
                .select(
                  "id, client_id, team_id, board_feature_id, story_type, name, stage, owner_initials, size_estimate_days, contractor_name, due_date, display_id, sequence_number, sort_order",
                )
                .eq("team_id", team.id)
                .eq("client_id", clientId!)
                .order("sort_order", { ascending: true });
              setStories((sData as StoryRow[]) ?? []);
            } catch (e) {
              console.error("Failed to refresh stories:", e);
            }
          }}
        />
      )}

      {detailStory && detailBoardFeature && (
        <StoryDetailPanel
          open={!!detailStory}
          story={detailStory}
          boardFeature={detailBoardFeature}
          lbcDisplayId={team.initiative?.display_id ?? null}
          members={members}
          sprints={sprints}
          clientId={clientId!}
          canEdit={canEdit}
          onClose={() => {
            setDetailStory(null);
            setDetailBoardFeature(null);
          }}
          onSaved={(updated) => {
            setStories((prev) =>
              prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
            );
            setDetailStory(null);
            setDetailBoardFeature(null);
          }}
        />
      )}

      {detailFeature && (
        <FeatureDetailPanel
          open={!!detailFeature}
          boardFeature={detailFeature}
          lbcDisplayId={team.initiative?.display_id ?? null}
          initiativeTitle={team.initiative?.title ?? null}
          canEdit={canEdit}
          onClose={() => setDetailFeature(null)}
          onSizeSaved={(id, value) => {
            setBoardFeatures((prev) =>
              prev.map((b) => (b.id === id ? { ...b, size_estimate_days: value } : b)),
            );
            setDetailFeature((prev) =>
              prev && prev.id === id ? { ...prev, size_estimate_days: value } : prev,
            );
          }}
        />
      )}
    </div>
  );
}

function FeatureCard({
  boardFeature,
  lbcDisplayId,
  featureNumber,
  onSizeChange,
  onAddStory,
  onOpen,
  canEdit,
  isManager,
  onMarkDelivered,
  onReturnToBacklog,
}: {
  boardFeature: BoardFeatureRow;
  lbcDisplayId: number | null;
  featureNumber: number | null;
  onSizeChange: (id: string, value: number | null) => void | Promise<void>;
  onAddStory: () => void;
  onOpen: () => void;
  canEdit: boolean;
  isManager: boolean;
  onMarkDelivered: () => void;
  onReturnToBacklog: () => void;
}) {
  const [size, setSize] = useState<string>(
    boardFeature.size_estimate_days != null ? String(boardFeature.size_estimate_days) : "",
  );
  const f = boardFeature.feature;
  const lbcPart = lbcDisplayId != null ? String(lbcDisplayId).padStart(3, "0") : "—";
  const fSeq = featureNumber ?? boardFeature.feature_sequence ?? f?.sort_order ?? "?";
  const featureCode = `${lbcPart}-F${fSeq}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="rounded-md border-2 border-blue-200 p-3 space-y-2 shadow-sm cursor-pointer hover:border-blue-300 transition-colors"
      style={{ backgroundColor: "#DBEAFE" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono font-semibold text-blue-900">{featureCode}</span>
        <div className="flex items-center gap-1">
          <Badge
            className="text-[10px] font-semibold"
            variant={f?.feature_type === "mvp" ? "default" : "secondary"}
          >
            {f?.feature_type === "mvp" ? "MVP" : "Post-MVP"}
          </Badge>
          {isManager && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Feature actions"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="p-0.5 rounded text-blue-900/70 hover:text-blue-900 hover:bg-white/60 transition-colors"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); onReturnToBacklog(); }}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Return to Backlog
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="text-sm font-semibold text-primary leading-tight">
        {f?.title ?? "(Untitled feature)"}
      </div>
      <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
        <div className="text-[11px] text-muted-foreground">
          {(() => {
            const d = f?.duration_months ?? null;
            if (!d || d <= 0) return "Duration: not set";
            return `Duration: ${d} ${d === 1 ? "month" : "months"}`;
          })()}
        </div>
      </div>

      {canEdit && (
        <Button
          size="sm"
          variant="outline"
          className="w-full bg-white"
          onClick={(e) => {
            e.stopPropagation();
            onAddStory();
          }}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Story
        </Button>
      )}
      {isManager && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation();
            onMarkDelivered();
          }}
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Mark as Delivered
        </Button>
      )}
    </div>
  );
}

function StoryCard({
  story,
  canEdit,
  onDelete,
  onOpen,
}: {
  story: StoryRow;
  canEdit: boolean;
  onDelete: (storyId: string) => Promise<boolean>;
  onOpen: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isTeam = story.story_type === "team";
  const bg = isTeam ? "#FEF9C3" : "#DCFCE7";
  const border = isTeam ? "border-yellow-300" : "border-green-300";
  const typeLabel = isTeam ? "Team" : "Contractor";
  const rightValue = isTeam
    ? story.size_estimate_days != null
      ? `${story.size_estimate_days}d`
      : "—"
    : story.due_date
      ? format(new Date(story.due_date), "MMM d")
      : "—";

  const handleConfirmDelete = async () => {
    setDeleting(true);
    const ok = await onDelete(story.id);
    setDeleting(false);
    if (ok) setConfirmOpen(false);
    else setConfirmOpen(false);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "relative rounded-md border p-1.5 shadow-sm cursor-grab active:cursor-grabbing gap-0",
        border,
      )}
      style={{ backgroundColor: bg }}
    >
      {canEdit && (
        <>
          <button
            type="button"
            aria-label="Delete story"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setConfirmOpen(true);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute top-0.5 right-0.5 p-0.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Story</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete {story.display_id ?? story.id} — {story.name}? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
                  onClick={(e) => {
                    e.preventDefault();
                    void handleConfirmDelete();
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
      <div className="flex items-center justify-between gap-1 text-[10px] leading-tight pr-4">
        <span className="font-mono font-semibold text-gray-700">
          {story.display_id ?? "—"}
        </span>
        <span className="uppercase tracking-wide text-gray-500 font-medium">
          {typeLabel}
        </span>
        <span className="font-semibold text-gray-700">{rightValue}</span>
      </div>
      <div className="text-xs font-bold text-gray-900 leading-snug">
        {story.name}
      </div>
      <div className="text-[10px] text-gray-700 leading-tight">
        {isTeam ? (
          <>
            <span className="text-gray-500">Owner:</span>{" "}
            <span className="font-semibold">{story.owner_initials ?? "—"}</span>
          </>
        ) : (
          <>
            <span className="text-gray-500">Contractor:</span>{" "}
            <span className="font-semibold">{story.contractor_name ?? "—"}</span>
          </>
        )}
      </div>
    </div>
  );
}

function AddStoryModal({
  open,
  onClose,
  boardFeature,
  lbcDisplayId,
  featureNumber,
  members,
  clientId,
  teamId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  boardFeature: BoardFeatureRow;
  lbcDisplayId: number | null;
  featureNumber: number | null;
  members: TeamMemberLite[];
  clientId: string;
  teamId: string;
  onSaved: () => void | Promise<void>;
}) {
  const [storyType, setStoryType] = useState<"team" | "contractor">("team");
  const [name, setName] = useState("");
  const [ownerInitials, setOwnerInitials] = useState("");
  const [estDays, setEstDays] = useState("");
  const [contractorName, setContractorName] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const lbcPart = lbcDisplayId != null ? String(lbcDisplayId).padStart(3, "0") : "—";
  const fSeq = featureNumber ?? boardFeature.feature_sequence ?? boardFeature.feature?.sort_order ?? "?";
  const featureCode = `${lbcPart}-F${fSeq}`;

  const resetForm = () => {
    setStoryType("team");
    setName("");
    setOwnerInitials("");
    setEstDays("");
    setContractorName("");
    setDueDate(undefined);
    setSaving(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Story Name is required");
      return;
    }
    if (storyType === "team" && !ownerInitials) {
      toast.error("Owner is required for team stories");
      return;
    }
    if (storyType === "contractor" && !contractorName.trim()) {
      toast.error("Contractor Name is required");
      return;
    }

    setSaving(true);

    const payload = {
      client_id: clientId,
      team_id: teamId,
      board_feature_id: boardFeature.id,
      story_type: storyType,
      name: name.trim(),
      stage: "feature" as const,
      owner_initials: storyType === "team" ? ownerInitials : null,
      size_estimate_days:
        storyType === "team" && estDays !== ""
          ? parseFloat(estDays) || null
          : null,
      contractor_name:
        storyType === "contractor" ? contractorName.trim() : null,
      due_date:
        storyType === "contractor" && dueDate
          ? dueDate.toISOString().slice(0, 10)
          : null,
    };

    const { error: insertError } = await supabase
      .from("kanban_stories")
      .insert(payload);

    setSaving(false);

    if (insertError) {
      toast.error("Failed to save story: " + insertError.message);
      return;
    }

    resetForm();
    onClose();
    toast.success("Story added successfully");

    try {
      await onSaved();
    } catch (e) {
      console.error("Refresh failed:", e);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Story — {featureCode}</DialogTitle>
          <DialogDescription className="sr-only">
            Add a new story to the {featureCode} feature swimlane.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Story Type *</Label>
            <Select
              value={storyType}
              onValueChange={(v) =>
                setStoryType(v as "team" | "contractor")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Team Story</SelectItem>
                <SelectItem value="contractor">Contractor Story</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Story Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What needs to be done?"
            />
          </div>

          {storyType === "team" ? (
            <>
              <div className="space-y-2">
                <Label>Owner *</Label>
                <Select
                  value={ownerInitials}
                  onValueChange={setOwnerInitials}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No team members defined
                      </div>
                    ) : (
                      members
                        .filter((m) => m.initials)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.initials}>
                            {m.initials} — {m.full_name}
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Est. Days</Label>
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={estDays}
                  onChange={(e) => setEstDays(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Contractor Name *</Label>
                <Input
                  value={contractorName}
                  onChange={(e) => setContractorName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dueDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Story"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
