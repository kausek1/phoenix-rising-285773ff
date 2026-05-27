import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/shared/SlideOver";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { X, CheckCircle2, Plus, Lightbulb, ArrowRight } from "lucide-react";
import type { Initiative, InitiativeStage, KanbanWipLimit } from "@/types/database";
import InitiativeMetricsTab from "@/components/initiatives/InitiativeMetricsTab";
import FeaturesTab from "@/components/features/FeaturesTab";
import SequencingTab from "@/components/initiatives/SequencingTab";
import RoadmapTab from "@/components/initiatives/RoadmapTab";


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
import { toast } from "sonner";
import { loadFlowHealth, classifyRYG, RYG_COLOR, type FlowStage, type StageStat, type ThresholdRow } from "@/lib/flow-health";

const ACTIVE_STAGES: InitiativeStage[] = ["funnel", "review", "analysis", "ready", "in_delivery"];
const WIP_STAGES: InitiativeStage[] = ["analysis", "ready", "in_delivery"];
const DECISION_COLOR: Record<string, string> = {
  approved: "bg-green-600 text-white",
  pivot: "bg-amber-500 text-white",
  deferred: "bg-slate-500 text-white",
  not_approved: "bg-red-600 text-white",
};

export default function KanbanActiveBoard() {
  const { clientId, role, session } = useAuth();
  const navigate = useNavigate();
  const canEdit = role === "admin" || role === "contributor";
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [wipLimits, setWipLimits] = useState<KanbanWipLimit[]>([]);
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([]);
  const [filterOwner, setFilterOwner] = useState("__all__");
  const [filterSprint, setFilterSprint] = useState("__all__");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'details' | 'metrics' | 'sequencing' | 'roadmap' | 'features'>('details');
  const [editFields, setEditFields] = useState<Partial<Initiative>>({});
  const [mounted, setMounted] = useState(false);
  const [deliverTarget, setDeliverTarget] = useState<Initiative | null>(null);
  const [deliverIncomplete, setDeliverIncomplete] = useState<number | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaSponsor, setIdeaSponsor] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [ideaSaving, setIdeaSaving] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    const [{ data: inits }, { data: wips }, { data: sp }] = await Promise.all([
      supabase.from("initiatives").select("*").eq("client_id", clientId),
      supabase.from("kanban_wip_limits").select("*").eq("client_id", clientId),
      supabase.from("sprints").select("id, name").eq("client_id", clientId),
    ]);
    setInitiatives((inits as Initiative[]) || []);
    setWipLimits((wips as KanbanWipLimit[]) || []);
    setSprints((sp as any[]) || []);
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Flow Health for column header coloring (Review, Analysis, Ready, In Delivery)
  const [flowStats, setFlowStats] = useState<Record<FlowStage, StageStat> | null>(null);
  const [flowThresholds, setFlowThresholds] = useState<Record<FlowStage, ThresholdRow> | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      // Fetch active PI window (try is_active, fall back to status='active')
      let piRow: any = null;
      const { data: a } = await supabase
        .from("planning_increments")
        .select("id, start_date, end_date")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .limit(1);
      piRow = a?.[0];
      if (!piRow) {
        const { data: b } = await supabase
          .from("planning_increments")
          .select("id, start_date, end_date")
          .eq("client_id", clientId)
          .eq("status", "active")
          .limit(1);
        piRow = b?.[0];
      }
      const piWindow =
        piRow?.start_date && piRow?.end_date
          ? { start: new Date(piRow.start_date), end: new Date(piRow.end_date) }
          : null;
      const { stats, thresholds } = await loadFlowHealth(clientId, piWindow);
      if (cancelled) return;
      setFlowStats(stats);
      setFlowThresholds(thresholds);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const filtered = initiatives.filter(i => {
    if (filterOwner !== "__all__" && i.owner_name !== filterOwner) return false;
    if (filterSprint !== "__all__" && i.sprint_id !== filterSprint) return false;
    return true;
  });
  const owners = [...new Set(initiatives.map(i => i.owner_name).filter(Boolean))] as string[];
  const byStage = (stage: InitiativeStage) => filtered.filter(i => i.stage === stage);
  const wipLimit = (stage: InitiativeStage) => wipLimits.find(w => w.stage === stage)?.wip_limit;

  async function openDeliverDialog(ini: Initiative, e: React.MouseEvent) {
    e.stopPropagation();
    setDeliverTarget(ini);
    setDeliverIncomplete(null);
    const { count } = await supabase
      .from("kanban_stories")
      .select("id", { count: "exact", head: true })
      .eq("initiative_id", ini.id)
      .neq("stage", "done");
    setDeliverIncomplete(count ?? 0);
  }

  async function confirmDeliver() {
    if (!deliverTarget || !clientId) return;
    setDelivering(true);
    const fromStage = deliverTarget.stage;
    const id = deliverTarget.id;
    const title = deliverTarget.title;
    try {
      const { error: uErr } = await supabase.from("initiatives").update({ stage: "deployed" }).eq("id", id);
      if (uErr) throw uErr;
      await supabase.from("kanban_stage_transitions").insert({
        client_id: clientId, initiative_id: id,
        from_stage: fromStage, to_stage: "deployed",
        changed_by: session?.user?.id, changed_at: new Date().toISOString(),
      });
      setInitiatives(prev => prev.map(i => i.id === id ? { ...i, stage: "deployed" as InitiativeStage } : i));
      toast.success(`${title} marked as Delivered`);
      setDeliverTarget(null);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Failed to mark as Delivered");
    } finally {
      setDelivering(false);
    }
  }


  const recentTransitionsRef = (globalThis as any).__phxRecentTransitionsRef ||= { current: new Map<string, number>() };
  async function onDragEnd(result: DropResult) {
    if (!result.destination || !canEdit) return;
    const toStage = result.destination.droppableId as InitiativeStage;
    const fromStage = result.source.droppableId as InitiativeStage;
    const id = result.draggableId;
    if (fromStage === toStage) return;

    // Guard against duplicate writes (StrictMode double-invoke, double events, etc.)
    const key = `${id}|${fromStage}|${toStage}`;
    const now = Date.now();
    const last = recentTransitionsRef.current.get(key);
    if (last && now - last < 5000) return;
    recentTransitionsRef.current.set(key, now);

    setInitiatives(prev => prev.map(i => i.id === id ? { ...i, stage: toStage } : i));
    await supabase.from("initiatives").update({ stage: toStage }).eq("id", id);
    await supabase.from("kanban_stage_transitions").insert({
      client_id: clientId, initiative_id: id,
      from_stage: fromStage, to_stage: toStage,
      changed_by: session?.user?.id, changed_at: new Date().toISOString(),
    });
  }

  function openDetail(ini: Initiative) {
    setDetailId(ini.id);
    setDetailTab('details');
    setEditFields({ ...ini, owner_name: ini.owner_name || lbcOwners[ini.id] || "" });
  }

  // Auto-advance approved LBCs to Ready
  useEffect(() => {
    const toAdvance = initiatives.filter(i =>
      i.lbc_decision === "approved" &&
      ["funnel", "review", "analysis"].includes(i.stage)
    );
    if (toAdvance.length === 0) return;
    (async () => {
      for (const ini of toAdvance) {
        await supabase.from("initiatives").update({ stage: "ready" }).eq("id", ini.id);
        await supabase.from("kanban_stage_transitions").insert({
          client_id: clientId, initiative_id: ini.id,
          from_stage: ini.stage, to_stage: "ready",
          changed_by: session?.user?.id, changed_at: new Date().toISOString(),
        });
      }
      fetchData();
    })();
  }, [initiatives]);

  async function saveDetail() {
    if (!detailId || !canEdit) return;
    const updates: Record<string, any> = {};
    const detail = initiatives.find(i => i.id === detailId);
    if (!detail) return;
    const editable = ["title", "description", "owner_name", "due_date", "sprint_id"] as const;
    for (const k of editable) {
      if ((editFields as any)[k] !== (detail as any)[k]) {
        updates[k] = (editFields as any)[k] ?? null;
      }
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("initiatives").update(updates).eq("id", detailId);
      fetchData();
    }
    setDetailId(null);
  }

  const detail = initiatives.find(i => i.id === detailId);
  const sprintName = (id: string | null) => sprints.find(s => s.id === id)?.name;

  // Find LBC number for an initiative
  const [lbcNumbers, setLbcNumbers] = useState<Record<string, number>>({});
  const [lbcOwners, setLbcOwners] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!clientId || initiatives.length === 0) return;
    (async () => {
      const ids = initiatives.map(i => i.id);
      const { data } = await supabase
        .from("lean_business_cases")
        .select("initiative_id, lbc_number, initiative_owner_name")
        .in("initiative_id", ids);
      if (data) {
        const numMap: Record<string, number> = {};
        const ownerMap: Record<string, string> = {};
        for (const d of data as any[]) {
          if (d.lbc_number) numMap[d.initiative_id] = d.lbc_number;
          if (d.initiative_owner_name) ownerMap[d.initiative_id] = d.initiative_owner_name;
        }
        setLbcNumbers(numMap);
        setLbcOwners(ownerMap);
      }
    })();
  }, [clientId, initiatives]);

  if (!mounted) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Portfolio Kanban Board</h1>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setIdeaTitle(""); setIdeaSponsor(""); setIdeaDescription(""); setIdeaOpen(true); }}>
              <Lightbulb className="h-4 w-4 mr-1.5" /> Add Idea
            </Button>
            <Button size="sm" onClick={() => navigate({ to: "/lbc/new" })}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Initiative
            </Button>
          </div>
        )}
      </div>



      {/* Filter bar */}
      <div className="flex items-center gap-2 print-hide">
        <Select value={filterSprint} onValueChange={setFilterSprint}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Sprint" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Sprints</SelectItem>
            {sprints.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterOwner} onValueChange={setFilterOwner}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Owners</SelectItem>
            {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterOwner !== "__all__" || filterSprint !== "__all__") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterOwner("__all__"); setFilterSprint("__all__"); }}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ACTIVE_STAGES.map(stage => {
            const cards = byStage(stage);
            const limit = wipLimit(stage);
            const overLimit = limit && cards.length > limit;
            const nearLimit = limit && cards.length >= limit * 0.8 && !overLimit;

            return (
              <Droppable key={stage} droppableId={stage}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="min-w-[220px] max-w-[260px] flex-shrink-0 flex flex-col bg-muted/30 rounded-lg"
                  >
                    {(() => {
                      const flowKeys: FlowStage[] = ["review", "analysis", "ready", "in_delivery"];
                      const isFlow = flowKeys.includes(stage as FlowStage);
                      const stat = isFlow ? flowStats?.[stage as FlowStage] : null;
                      const thr = isFlow ? flowThresholds?.[stage as FlowStage] : null;
                      const ryg = stat ? classifyRYG(stat.avgDaysCurrent, thr ?? undefined) : "none";
                      const color = ryg !== "none" ? RYG_COLOR[ryg] : undefined;
                      const tooltip =
                        isFlow && stat?.avgDaysCurrent != null && thr
                          ? `Avg ${stat.avgDaysCurrent.toFixed(1)} days this quarter. Target: ≤ ${thr.green_max_days} days`
                          : undefined;
                      return (
                        <div className={`px-3 py-2 rounded-t-lg border-b text-sm font-semibold flex items-center justify-between ${
                          overLimit ? "border-destructive bg-destructive/10" :
                          nearLimit ? "border-warning bg-warning/10" :
                          "border-border"
                        }`}>
                          <span className="capitalize" style={color ? { color } : undefined} title={tooltip}>
                            {stage.replace(/_/g, " ")}
                          </span>
                          <span className="text-xs">{cards.length}{limit ? ` / ${limit}` : ""}</span>
                        </div>
                      );
                    })()}
                    <div className="flex-1 p-2 space-y-2 min-h-[100px]">
                      {cards.map((ini, idx) => {
                        const lbcNum = lbcNumbers[ini.id];
                        const sName = sprintName(ini.sprint_id);
                        return (
                          <Draggable key={ini.id} draggableId={ini.id} index={idx} isDragDisabled={!canEdit}>
                            {(prov) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className="bg-card rounded-md border p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                                onClick={() => openDetail(ini)}
                              >
                                <p className="text-sm font-medium mb-2 line-clamp-2">{ini.title}</p>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {lbcNum && (
                                    <Badge className="kanban-lbc-badge text-xs">
                                      LBC-{String(lbcNum).padStart(3, "0")}
                                    </Badge>
                                  )}
                                  {ini.wsjf_score != null && (
                                    <Badge className="kanban-wsjf-badge text-xs">
                                      {ini.wsjf_score.toFixed(1)}
                                    </Badge>
                                  )}
                                  {ini.owner_name && (
                                    <div className="kanban-avatar h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold">
                                      {ini.owner_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                    </div>
                                  )}
                                  {ini.due_date && (
                                    <span className={`text-xs ${new Date(ini.due_date) < new Date() ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                      {ini.due_date}
                                    </span>
                                  )}
                                  {sName && <Badge variant="outline" className="text-xs">{sName}</Badge>}
                                </div>
                                {stage === "analysis" && ini.lbc_decision && (
                                  <Badge className={`mt-1.5 text-xs ${DECISION_COLOR[ini.lbc_decision] || ""}`}>
                                    {ini.lbc_decision.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                  </Badge>
                                )}
                                {canEdit && (
                                  <div className="mt-2 pt-2 border-t border-border/60 flex justify-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                                      onClick={(e) => openDeliverDialog(ini, e)}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                      Mark as Delivered
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>


      <AlertDialog open={!!deliverTarget} onOpenChange={(v) => { if (!v) setDeliverTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Delivered</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">Feature:</span> <span className="font-medium text-foreground">{deliverTarget?.title}</span></div>
                <div><span className="text-muted-foreground">Current stage:</span> <span className="capitalize">{deliverTarget?.stage.replace(/_/g, " ")}</span></div>
                {deliverIncomplete === null ? (
                  <div className="text-muted-foreground italic">Checking story status…</div>
                ) : deliverIncomplete > 0 ? (
                  <div className="text-warning font-medium">
                    {deliverIncomplete} {deliverIncomplete === 1 ? "story is" : "stories are"} not yet Done. Mark as Delivered anyway?
                  </div>
                ) : (
                  <div className="text-success font-medium">All stories complete. Ready to mark as Delivered.</div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delivering}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDeliver(); }}
              disabled={delivering || deliverIncomplete === null}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {delivering ? "Delivering…" : "Confirm Delivery"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Detail slide-over */}
      <SlideOver open={!!detailId} onClose={() => setDetailId(null)} title={detail?.title || "Initiative"}>
        {detail && (
          <div className="space-y-4 text-sm">
            {/* Tab bar */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                  detailTab === 'details'
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setDetailTab('details')}
              >
                Details
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                  detailTab === 'metrics'
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setDetailTab('metrics')}
              >
                Metrics
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                  detailTab === 'sequencing'
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setDetailTab('sequencing')}
              >
                Sequencing
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                  detailTab === 'roadmap'
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setDetailTab('roadmap')}
              >
                Roadmap
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                  detailTab === 'features'
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setDetailTab('features')}
              >
                Features
              </button>

            </div>

            {detailTab === 'details' && (
              <div className="space-y-4">
                {canEdit ? (
                  <>
                    <div>
                      <Label className="text-xs text-muted-foreground">Title</Label>
                      <Input value={editFields.title || ""} onChange={e => setEditFields(p => ({ ...p, title: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <Textarea value={editFields.description || ""} onChange={e => setEditFields(p => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Owner</Label>
                      <Input value={editFields.owner_name || ""} onChange={e => setEditFields(p => ({ ...p, owner_name: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Due Date</Label>
                      <Input type="date" value={editFields.due_date || ""} onChange={e => setEditFields(p => ({ ...p, due_date: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Sprint</Label>
                      <Select value={editFields.sprint_id || "__none__"} onValueChange={v => setEditFields(p => ({ ...p, sprint_id: v === "__none__" ? null : v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {sprints.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><span className="text-muted-foreground">Stage:</span> <span className="capitalize">{detail.stage.replace(/_/g, " ")}</span></div>
                      <div><span className="text-muted-foreground">WSJF:</span> {detail.wsjf_score?.toFixed(2) ?? "—"}</div>
                      <div><span className="text-muted-foreground">Risk:</span> {detail.risk_level?.replace(/_/g, " ") || "—"}</div>
                      <div><span className="text-muted-foreground">LBC Decision:</span> {detail.lbc_decision?.replace(/_/g, " ") || "—"}</div>
                    </div>
                    <Button onClick={saveDetail} className="w-full">Save Changes</Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div><span className="text-muted-foreground">Stage:</span> {detail.stage}</div>
                    <div><span className="text-muted-foreground">Owner:</span> {detail.owner_name || "—"}</div>
                    <div><span className="text-muted-foreground">WSJF:</span> {detail.wsjf_score?.toFixed(2) ?? "—"}</div>
                    <div><span className="text-muted-foreground">Description:</span> {detail.description || "—"}</div>
                    <div><span className="text-muted-foreground">Risk:</span> {detail.risk_level || "—"}</div>
                    <div><span className="text-muted-foreground">LBC Decision:</span> {detail.lbc_decision || "—"}</div>
                    <div><span className="text-muted-foreground">Due Date:</span> {detail.due_date || "—"}</div>
                  </div>
                )}
              </div>
            )}

            {detailTab === 'metrics' && detailId && (
              <InitiativeMetricsTab initiativeId={detailId} />
            )}

            {detailTab === 'features' && detailId && clientId && (
              <FeaturesTab initiativeId={detailId} clientId={clientId} />
            )}

            {detailTab === 'sequencing' && detailId && (
              <SequencingTab initiativeId={detailId} />
            )}

            {detailTab === 'roadmap' && detailId && (
              <RoadmapTab
                initiativeId={detailId}
                onGoToSequencing={() => setDetailTab('sequencing')}
              />
            )}

          </div>
        )}
      </SlideOver>
    </div>
  );
}
