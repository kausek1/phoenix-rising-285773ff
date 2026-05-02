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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
            "id, team_id, feature_id, client_id, size_estimate_days, pulled_at, feature_sequence, features(id, feature_type, title, sort_order)",
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
        supabase
          .from("kanban_stories")
          .select(
            "id, client_id, team_id, board_feature_id, story_type, name, stage, owner_initials, size_estimate_days, contractor_name, due_date, display_id, sequence_number",
          )
          .eq("team_id", teamId)
          .eq("client_id", clientId)
          .order("sequence_number", { ascending: true }),
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
    return map;
  }, [stories, boardFeatures]);

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
    if (destination.droppableId === source.droppableId) return;

    // droppableId format: "{boardFeatureId}::{stage}"
    const [destBf, destStage] = destination.droppableId.split("::");
    const [srcBf] = source.droppableId.split("::");
    if (destBf !== srcBf) return; // safety: can't cross swimlanes

    const story = stories.find((s) => s.id === draggableId);
    if (!story) return;
    const prevStage = story.stage;
    const newStage = destStage as Stage;

    // Optimistic update
    setStories((prev) =>
      prev.map((s) => (s.id === draggableId ? { ...s, stage: newStage } : s)),
    );

    const { error: uErr } = await supabase
      .from("kanban_stories")
      .update({ stage: newStage })
      .eq("id", draggableId);
    if (uErr) {
      console.error(uErr);
      toast.error(uErr.message ?? "Failed to move story");
      // Revert
      setStories((prev) =>
        prev.map((s) => (s.id === draggableId ? { ...s, stage: prevStage } : s)),
      );
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

      {/* Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="overflow-x-auto border rounded-md bg-card">
          <div className="min-w-[1200px]">
            {/* Header row */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] bg-muted/50 border-b">
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
            {boardFeatures.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                No features on the board yet. Use the pull feature control above to add your first
                feature.
              </div>
            ) : (
              boardFeatures.map((bf, idx) => {
                const lanes = storiesBySwimlane[bf.id];
                return (
                  <div
                    key={bf.id}
                    className={cn(
                      "grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b last:border-b-0",
                      idx % 2 === 1 ? "bg-muted/20" : "",
                    )}
                  >
                    {/* Feature column */}
                    <div className="px-3 py-3 border-r min-h-[160px]">
                      <FeatureCard
                        boardFeature={bf}
                        lbcDisplayId={team.initiative?.display_id ?? null}
                        onSizeChange={handleSizeChange}
                        onAddStory={() => setAddStoryFor(bf)}
                        canEdit={canEdit}
                      />
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
                                "px-2 py-2 border-r last:border-r-0 min-h-[160px] space-y-2 transition-colors",
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
                                      <StoryCard story={s} />
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

      {/* Add Story Modal */}
      {addStoryFor && (
        <AddStoryModal
          open={!!addStoryFor}
          onClose={() => setAddStoryFor(null)}
          boardFeature={addStoryFor}
          lbcDisplayId={team.initiative?.display_id ?? null}
          members={members}
          clientId={clientId!}
          teamId={team.id}
          onSaved={async () => {
            setAddStoryFor(null);
            const { data: sData } = await supabase
              .from("kanban_stories")
              .select(
                "id, client_id, team_id, board_feature_id, story_type, name, stage, owner_initials, size_estimate_days, contractor_name, due_date, display_id, sequence_number",
              )
              .eq("team_id", team.id)
              .eq("client_id", clientId!)
              .order("sequence_number", { ascending: true });
            setStories((sData as StoryRow[]) ?? []);
          }}
        />
      )}
    </div>
  );
}

function FeatureCard({
  boardFeature,
  lbcDisplayId,
  onSizeChange,
  onAddStory,
  canEdit,
}: {
  boardFeature: BoardFeatureRow;
  lbcDisplayId: number | null;
  onSizeChange: (id: string, value: number | null) => void | Promise<void>;
  onAddStory: () => void;
  canEdit: boolean;
}) {
  const [size, setSize] = useState<string>(
    boardFeature.size_estimate_days != null ? String(boardFeature.size_estimate_days) : "",
  );
  const f = boardFeature.feature;
  const lbcPart = lbcDisplayId != null ? String(lbcDisplayId).padStart(3, "0") : "—";
  const fSeq = boardFeature.feature_sequence ?? f?.sort_order ?? "?";
  const featureCode = `${lbcPart}-F${fSeq}`;

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
          disabled={!canEdit}
          className="h-8 text-sm bg-white"
        />
      </div>
      {canEdit && (
        <Button size="sm" variant="outline" className="w-full bg-white" onClick={onAddStory}>
          <Plus className="h-3 w-3 mr-1" />
          Add Story
        </Button>
      )}
    </div>
  );
}

function StoryCard({ story }: { story: StoryRow }) {
  const isTeam = story.story_type === "team";
  const bg = isTeam ? "#FEF9C3" : "#DCFCE7";
  const border = isTeam ? "border-yellow-300" : "border-green-300";
  const typeLabel = isTeam ? "Team" : "Contractor";

  return (
    <div
      className={cn("rounded-md border p-2 shadow-sm cursor-grab active:cursor-grabbing", border)}
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="text-[10px] font-mono font-semibold text-gray-700">
          {story.display_id ?? "—"}
        </span>
        <span className="text-[9px] uppercase tracking-wide text-gray-500 font-medium">
          {typeLabel}
        </span>
      </div>
      <div className="text-xs font-medium text-gray-900 leading-snug mb-1.5">{story.name}</div>
      {isTeam ? (
        <div className="text-[10px] text-gray-700 space-y-0.5">
          <div>
            <span className="text-gray-500">Owner:</span>{" "}
            <span className="font-semibold">{story.owner_initials ?? "—"}</span>
          </div>
          {story.size_estimate_days != null && (
            <div>
              <span className="text-gray-500">Est. Days:</span>{" "}
              <span className="font-semibold">{story.size_estimate_days}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-gray-700 space-y-0.5">
          <div>
            <span className="text-gray-500">Contractor:</span>{" "}
            <span className="font-semibold">{story.contractor_name ?? "—"}</span>
          </div>
          {story.due_date && (
            <div>
              <span className="text-gray-500">Due:</span>{" "}
              <span className="font-semibold">
                {format(new Date(story.due_date), "MMM d, yyyy")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddStoryModal({
  open,
  onClose,
  boardFeature,
  lbcDisplayId,
  members,
  clientId,
  teamId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  boardFeature: BoardFeatureRow;
  lbcDisplayId: number | null;
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
  const fSeq = boardFeature.feature_sequence ?? boardFeature.feature?.sort_order ?? "?";
  const featureCode = `${lbcPart}-F${fSeq}`;

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
    try {
      const payload: Record<string, unknown> = {
        client_id: clientId,
        team_id: teamId,
        board_feature_id: boardFeature.id,
        story_type: storyType,
        name: name.trim(),
        stage: "feature",
        owner_initials: storyType === "team" ? ownerInitials : null,
        size_estimate_days:
          storyType === "team" && estDays !== ""
            ? parseInt(estDays, 10) || null
            : null,
        contractor_name: storyType === "contractor" ? contractorName.trim() : null,
        due_date:
          storyType === "contractor" && dueDate
            ? dueDate.toISOString().slice(0, 10)
            : null,
      };

      const { error: insertError } = await supabase
        .from("kanban_stories")
        .insert({ ...payload });

      if (insertError) {
        toast.error("Failed to save story. Please try again.");
        return;
      }

      // Success path
      onClose();
      toast.success("Story added successfully");
      await onSaved();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to add story");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
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
            <Select value={storyType} onValueChange={(v) => setStoryType(v as "team" | "contractor")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Select value={ownerInitials} onValueChange={setOwnerInitials}>
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
                  min={1}
                  step={1}
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
          <Button variant="outline" onClick={onClose} disabled={saving}>
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
