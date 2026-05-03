import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SprintInfo {
  id: string;
  name: string;
  sprint_number: number | null;
  start_date: string;
  end_date: string;
}

interface PIInfo {
  id: string;
  name: string;
}

interface StoryItem {
  id: string;
  name: string;
  story_type: "team" | "contractor";
  feature_title: string;
  board_feature_id: string;
  sprint_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  initiativeId: string;
  pi: PIInfo | null;
  sprint: SprintInfo | null;
  sprintLabel: string;
}

export function SprintPlanningPanel({
  open, onClose, clientId, initiativeId, pi, sprint, sprintLabel,
}: Props) {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!open || !clientId || !initiativeId) return;
    setLoading(true);
    try {
      // Get all kanban_board_features for teams of this initiative
      const { data: teams } = await supabase
        .from("kanban_teams")
        .select("id")
        .eq("client_id", clientId)
        .eq("initiative_id", initiativeId);
      const teamIds = (teams ?? []).map((t: any) => t.id);
      if (teamIds.length === 0) {
        setStories([]);
        return;
      }
      const { data: bf } = await supabase
        .from("kanban_board_features")
        .select("id, feature_id, features(title)")
        .eq("client_id", clientId)
        .in("team_id", teamIds);
      const bfList = (bf ?? []) as any[];
      const featureTitleByBf = new Map<string, string>(
        bfList.map((r) => [r.id, r.features?.title ?? "Feature"]),
      );
      const bfIds = bfList.map((r) => r.id);
      if (bfIds.length === 0) {
        setStories([]);
        return;
      }
      const { data: storyRows, error: sErr } = await supabase
        .from("kanban_stories")
        .select("id, name, story_type, board_feature_id, sprint_id, stage")
        .eq("client_id", clientId)
        .in("board_feature_id", bfIds)
        .neq("stage", "done");
      if (sErr) throw sErr;
      const list: StoryItem[] = (storyRows ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        story_type: r.story_type,
        board_feature_id: r.board_feature_id,
        sprint_id: r.sprint_id ?? null,
        feature_title: featureTitleByBf.get(r.board_feature_id) ?? "Feature",
      }));
      setStories(list);
    } catch (e: any) {
      console.error("[SprintPlanningPanel] load", e);
      toast.error(e?.message ?? "Failed to load stories");
    } finally {
      setLoading(false);
    }
  }, [open, clientId, initiativeId]);

  useEffect(() => { void load(); }, [load]);

  const commit = async (story: StoryItem) => {
    if (!sprint) return;
    const prev = stories;
    setStories((s) => s.map((x) => x.id === story.id ? { ...x, sprint_id: sprint.id } : x));
    const { error } = await supabase
      .from("kanban_stories")
      .update({ sprint_id: sprint.id, committed_to_sprint_at: new Date().toISOString() })
      .eq("id", story.id);
    if (error) {
      toast.error(error.message);
      setStories(prev);
    }
  };

  const remove = async (story: StoryItem) => {
    const prev = stories;
    setStories((s) => s.map((x) => x.id === story.id ? { ...x, sprint_id: null } : x));
    const { error } = await supabase
      .from("kanban_stories")
      .update({ sprint_id: null, committed_to_sprint_at: null })
      .eq("id", story.id);
    if (error) {
      toast.error(error.message);
      setStories(prev);
    }
  };

  const available = stories.filter((s) => !s.sprint_id);
  const committed = stories.filter((s) => sprint && s.sprint_id === sprint.id);

  const typeBadge = (t: "team" | "contractor") =>
    t === "team"
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : "bg-green-100 text-green-800 border-green-200";

  const renderStory = (s: StoryItem, action: "add" | "remove") => (
    <div key={s.id} className="rounded-md border bg-card p-2.5 flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate-500 truncate">{s.feature_title}</p>
        <p className="text-[13px] text-slate-900 font-medium leading-snug">{s.name}</p>
        <Badge variant="outline" className={`mt-1 text-[10px] ${typeBadge(s.story_type)}`}>
          {s.story_type === "team" ? "TEAM" : "CONTRACTOR"}
        </Badge>
      </div>
      <Button
        size="icon"
        variant="outline"
        className="h-7 w-7 shrink-0"
        onClick={() => action === "add" ? commit(s) : remove(s)}
        aria-label={action === "add" ? "Commit to sprint" : "Remove from sprint"}
      >
        {action === "add" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </Button>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-[520px] overflow-y-auto p-0 flex flex-col">
        <SheetHeader className="p-5 border-b">
          <SheetTitle className="text-primary">Sprint Planning</SheetTitle>
          <SheetDescription className="text-xs">
            {pi && sprint ? `${pi.name} · ${sprintLabel}` : "No active sprint"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
          <div className="space-y-2">
            <h3 className="text-[14px] font-bold text-primary">Feature Backlog</h3>
            <p className="text-[12px] text-slate-500">Stories not yet assigned to a sprint</p>
            <div className="space-y-2 mt-2">
              {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
              {!loading && available.length === 0 && (
                <p className="text-xs text-muted-foreground">No available stories.</p>
              )}
              {available.map((s) => renderStory(s, "add"))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[14px] font-bold text-primary">
              {sprint ? `Sprint ${sprint.sprint_number ?? ""} Commitment`.trim() : "Sprint Commitment"}
            </h3>
            <p className="text-[12px] text-slate-500">Stories committed to this sprint</p>
            <div className="space-y-2 mt-2">
              {!sprint && (
                <p className="text-xs text-muted-foreground">No active sprint.</p>
              )}
              {sprint && committed.length === 0 && !loading && (
                <p className="text-xs text-muted-foreground">No stories committed yet.</p>
              )}
              {committed.map((s) => renderStory(s, "remove"))}
            </div>
          </div>
        </div>

        <div className="border-t p-4 flex items-center justify-between">
          <span className="text-sm text-slate-600">
            {committed.length} {committed.length === 1 ? "story" : "stories"} committed
          </span>
          <Button onClick={onClose}>Close</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
