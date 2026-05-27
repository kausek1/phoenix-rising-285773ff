import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Stage = "feature" | "backlog" | "define" | "build" | "test" | "deploy" | "done";

export interface StoryRowLite {
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
  created_at?: string | null;
}

export interface SprintLite {
  id: string;
  name: string;
  sprint_number: number | null;
}

export interface BoardFeatureLite {
  id: string;
  feature_sequence: number | null;
  feature: {
    id: string;
    feature_type: "mvp" | "post_mvp";
    title: string;
    sort_order: number | null;
  } | null;
}

export interface TeamMemberLite {
  id: string;
  initials: string;
  full_name: string;
  profile_id: string | null;
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StoryDetailPanel({
  open,
  story,
  boardFeature,
  lbcDisplayId,
  members,
  sprints,
  canEdit,
  onClose,
  onSaved,
}: {
  open: boolean;
  story: StoryRowLite;
  boardFeature: BoardFeatureLite;
  lbcDisplayId: number | null;
  members: TeamMemberLite[];
  sprints: SprintLite[];
  clientId: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (updated: StoryRowLite) => void;
}) {
  const [name, setName] = useState(story.name);
  const [ownerInitials, setOwnerInitials] = useState(story.owner_initials ?? "");
  const [estDays, setEstDays] = useState(
    story.size_estimate_days != null ? String(story.size_estimate_days) : "",
  );
  const [contractorName, setContractorName] = useState(story.contractor_name ?? "");
  const [dueDate, setDueDate] = useState<Date | undefined>(
    story.due_date ? new Date(story.due_date) : undefined,
  );
  const [stage, setStage] = useState<Stage>(story.stage);
  const [sprintId, setSprintId] = useState<string>(story.sprint_id ?? "__none__");
  const [acceptance, setAcceptance] = useState<string>(story.acceptance_criteria ?? "");
  const [saving, setSaving] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(story.created_at ?? null);

  // Reset state whenever the loaded story changes
  useEffect(() => {
    setName(story.name);
    setOwnerInitials(story.owner_initials ?? "");
    setEstDays(story.size_estimate_days != null ? String(story.size_estimate_days) : "");
    setContractorName(story.contractor_name ?? "");
    setDueDate(story.due_date ? new Date(story.due_date) : undefined);
    setStage(story.stage);
    setSprintId(story.sprint_id ?? "__none__");
    setAcceptance(story.acceptance_criteria ?? "");
    setCreatedAt(story.created_at ?? null);
  }, [story]);

  // Fetch created_at if not present
  useEffect(() => {
    if (createdAt || !open) return;
    (async () => {
      const { data } = await supabase
        .from("kanban_stories")
        .select("created_at")
        .eq("id", story.id)
        .single();
      if (data?.created_at) setCreatedAt(data.created_at as string);
    })();
  }, [open, story.id, createdAt]);

  const isTeam = story.story_type === "team";
  const lbcPart = lbcDisplayId != null ? String(lbcDisplayId).padStart(3, "0") : "—";
  const fSeq = boardFeature.feature_sequence ?? boardFeature.feature?.sort_order ?? "?";
  const featureCode = `${lbcPart}-F${fSeq}`;

  const handleCancel = () => {
    setName(story.name);
    setOwnerInitials(story.owner_initials ?? "");
    setEstDays(story.size_estimate_days != null ? String(story.size_estimate_days) : "");
    setContractorName(story.contractor_name ?? "");
    setDueDate(story.due_date ? new Date(story.due_date) : undefined);
    setStage(story.stage);
    setSprintId(story.sprint_id ?? "__none__");
    setAcceptance(story.acceptance_criteria ?? "");
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Story Name is required");
      return;
    }
    if (isTeam && !ownerInitials) {
      toast.error("Owner is required for team stories");
      return;
    }
    if (!isTeam && !contractorName.trim()) {
      toast.error("Contractor Name is required");
      return;
    }
    setSaving(true);
    const nextSprintId = sprintId === "__none__" ? null : sprintId;
    const nextAc = acceptance.trim() === "" ? null : acceptance;
    const payload: Record<string, unknown> = {
      name: name.trim(),
      owner_initials: isTeam ? ownerInitials : null,
      size_estimate_days:
        isTeam && estDays !== "" ? parseFloat(estDays) : isTeam ? null : story.size_estimate_days,
      contractor_name: !isTeam ? contractorName.trim() : null,
      due_date: !isTeam && dueDate ? dueDate.toISOString().slice(0, 10) : !isTeam ? null : story.due_date,
      stage,
      sprint_id: nextSprintId,
      acceptance_criteria: nextAc,
    };
    const { error } = await supabase
      .from("kanban_stories")
      .update(payload)
      .eq("id", story.id);
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Failed to update story");
      return;
    }
    const updated: StoryRowLite = {
      ...story,
      name: name.trim(),
      owner_initials: isTeam ? ownerInitials : null,
      size_estimate_days:
        isTeam && estDays !== "" ? parseFloat(estDays) : isTeam ? null : story.size_estimate_days,
      contractor_name: !isTeam ? contractorName.trim() : null,
      due_date:
        !isTeam && dueDate
          ? dueDate.toISOString().slice(0, 10)
          : !isTeam
            ? null
            : story.due_date,
      stage,
      sprint_id: nextSprintId,
      acceptance_criteria: nextAc,
    };
    toast.success("Story updated");
    onSaved(updated);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-muted-foreground">
              {story.display_id ?? "—"}
            </span>
            <Badge variant={isTeam ? "default" : "secondary"}>
              {isTeam ? "Team" : "Contractor"}
            </Badge>
            <Badge variant="outline">{titleCase(story.stage)}</Badge>
          </div>
          <SheetTitle className="text-lg leading-tight">{story.name}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Story Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit}
              />
            </div>

            {isTeam ? (
              <>
                <div className="space-y-2">
                  <Label>Owner</Label>
                  <Select
                    value={ownerInitials}
                    onValueChange={setOwnerInitials}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {members
                        .filter((m) => m.initials)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.initials}>
                            {m.initials} — {m.full_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estimated Days</Label>
                  <Input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={estDays}
                    onChange={(e) => setEstDays(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Contractor Name</Label>
                  <Input
                    value={contractorName}
                    onChange={(e) => setContractorName(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canEdit}
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

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <div>
                <span className="font-medium text-foreground/70">Story ID:</span>{" "}
                {story.display_id ?? "—"}
              </div>
              <div>
                <span className="font-medium text-foreground/70">Feature:</span> {featureCode}
              </div>
              <div>
                <span className="font-medium text-foreground/70">Current Stage:</span>{" "}
                {titleCase(story.stage)}
              </div>
              <div>
                <span className="font-medium text-foreground/70">Created:</span>{" "}
                {createdAt ? format(new Date(createdAt), "MMM d, yyyy") : "—"}
              </div>
            </div>

            {canEdit && (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" onClick={handleCancel} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <div className="rounded-md border bg-muted/20 p-6 flex flex-col items-center text-center space-y-2">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Activity & History</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Story activity, comments, and time tracking will be available in a future update.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export function FeatureDetailPanel({
  open,
  boardFeature,
  lbcDisplayId,
  initiativeTitle,
  canEdit,
  onClose,
  onSizeSaved,
}: {
  open: boolean;
  boardFeature: {
    id: string;
    size_estimate_days: number | null;
    pulled_at: string;
    feature_sequence: number | null;
    feature: {
      id: string;
      feature_type: "mvp" | "post_mvp";
      title: string;
      sort_order: number | null;
    } | null;
  };
  lbcDisplayId: number | null;
  initiativeTitle: string | null;
  canEdit: boolean;
  onClose: () => void;
  onSizeSaved: (id: string, value: number | null) => void;
}) {
  const [size, setSize] = useState<string>(
    boardFeature.size_estimate_days != null ? String(boardFeature.size_estimate_days) : "",
  );
  const [acceptance, setAcceptance] = useState<string>("");

  useEffect(() => {
    setSize(
      boardFeature.size_estimate_days != null ? String(boardFeature.size_estimate_days) : "",
    );
  }, [boardFeature.size_estimate_days]);

  useEffect(() => {
    if (!open || !boardFeature.feature?.id) return;
    (async () => {
      const { data } = await supabase
        .from("features")
        .select("acceptance_criteria")
        .eq("id", boardFeature.feature!.id)
        .single();
      setAcceptance((data?.acceptance_criteria as string) ?? "");
    })();
  }, [open, boardFeature.feature?.id]);

  const f = boardFeature.feature;
  const lbcPart = lbcDisplayId != null ? String(lbcDisplayId).padStart(3, "0") : "—";
  const fSeq = boardFeature.feature_sequence ?? f?.sort_order ?? "?";
  const featureCode = `${lbcPart}-F${fSeq}`;

  const handleBlur = async () => {
    const parsed = size === "" ? null : Number(size);
    if (parsed != null && Number.isNaN(parsed)) return;
    if (parsed === boardFeature.size_estimate_days) return;
    const { error } = await supabase
      .from("kanban_board_features")
      .update({ size_estimate_days: parsed })
      .eq("id", boardFeature.id);
    if (error) {
      toast.error(error.message ?? "Failed to save size estimate");
      return;
    }
    onSizeSaved(boardFeature.id, parsed);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-muted-foreground">
              {featureCode}
            </span>
            <Badge variant={f?.feature_type === "mvp" ? "default" : "secondary"}>
              {f?.feature_type === "mvp" ? "MVP" : "Post-MVP"}
            </Badge>
          </div>
          <SheetTitle className="text-lg leading-tight">
            {f?.title ?? "(Untitled feature)"}
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Feature Name</Label>
              <Input value={f?.title ?? ""} disabled />
            </div>

            <div className="space-y-2">
              <Label>Acceptance Criteria</Label>
              <div className="rounded-md border bg-muted/20 p-3 text-sm whitespace-pre-wrap min-h-[80px]">
                {acceptance ? acceptance : <span className="text-muted-foreground">No acceptance criteria.</span>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Est. Size (team days)</Label>
              <Input
                type="number"
                min={0}
                value={size}
                onChange={(e) => setSize(e.target.value)}
                onBlur={handleBlur}
                disabled={!canEdit}
              />
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <div>
                <span className="font-medium text-foreground/70">Feature ID:</span> {featureCode}
              </div>
              <div>
                <span className="font-medium text-foreground/70">Initiative:</span>{" "}
                {initiativeTitle ?? "—"}
              </div>
              <div>
                <span className="font-medium text-foreground/70">Pulled onto board:</span>{" "}
                {boardFeature.pulled_at
                  ? format(new Date(boardFeature.pulled_at), "MMM d, yyyy")
                  : "—"}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <div className="rounded-md border bg-muted/20 p-6 flex flex-col items-center text-center space-y-2">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Activity & History</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Feature activity, comments, and history will be available in a future update.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
