import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/shared/SlideOver";
import { X } from "lucide-react";
import type { Initiative, InitiativeStage, KanbanWipLimit } from "@/types/database";

const STAGES: InitiativeStage[] = ["funnel", "review", "analysis", "ready", "in_delivery", "deployed", "closed", "archive"];
const WIP_STAGES: InitiativeStage[] = ["analysis", "ready", "in_delivery"];
const DECISION_COLOR: Record<string, string> = { approved: "bg-success/80", pivot: "bg-warning/80", deferred: "bg-muted-foreground/80", not_approved: "bg-destructive/80" };

export default function KanbanBoard() {
  const { clientId, role, session } = useAuth();
  const canEdit = role === "admin" || role === "contributor";
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [wipLimits, setWipLimits] = useState<KanbanWipLimit[]>([]);
  const [filterOwner, setFilterOwner] = useState("__all__");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const fetch = useCallback(async () => {
    if (!clientId) return;
    const [{ data: inits }, { data: wips }] = await Promise.all([
      supabase.from("initiatives").select("*").eq("client_id", clientId),
      supabase.from("kanban_wip_limits").select("*").eq("client_id", clientId),
    ]);
    setInitiatives((inits as Initiative[]) || []);
    setWipLimits((wips as KanbanWipLimit[]) || []);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = filterOwner === "__all__" ? initiatives : initiatives.filter(i => i.owner_name === filterOwner);
  const owners = [...new Set(initiatives.map(i => i.owner_name).filter(Boolean))] as string[];
  const byStage = (stage: InitiativeStage) => filtered.filter(i => i.stage === stage);
  const wipLimit = (stage: InitiativeStage) => wipLimits.find(w => w.stage === stage)?.wip_limit;

  async function onDragEnd(result: DropResult) {
    if (!result.destination || !canEdit) return;
    const toStage = result.destination.droppableId as InitiativeStage;
    const fromStage = result.source.droppableId as InitiativeStage;
    const id = result.draggableId;
    if (fromStage === toStage) return;

    setInitiatives(prev => prev.map(i => i.id === id ? { ...i, stage: toStage } : i));
    await supabase.from("initiatives").update({ stage: toStage }).eq("id", id);
    await supabase.from("kanban_stage_transitions").insert({
      client_id: clientId, initiative_id: id,
      from_stage: fromStage, to_stage: toStage,
      changed_by: session?.user?.id, changed_at: new Date().toISOString(),
    });
  }

  const detail = initiatives.find(i => i.id === detailId);

  if (!mounted) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Kanban Board</h1>
        <div className="flex items-center gap-2">
          <Select value={filterOwner} onValueChange={setFilterOwner}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Filter owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Owners</SelectItem>
              {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          {filterOwner !== "__all__" && <Button variant="ghost" size="sm" onClick={() => setFilterOwner("__all__")}><X className="h-4 w-4" /></Button>}
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(stage => {
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
                    <div className={`px-3 py-2 rounded-t-lg border-b text-sm font-semibold flex items-center justify-between ${overLimit ? "border-destructive bg-destructive/10 text-destructive" : nearLimit ? "border-warning bg-warning/10 text-warning" : "border-border"}`}>
                      <span className="capitalize">{stage.replace(/_/g, " ")}</span>
                      <span className="text-xs">{cards.length}{limit ? ` / ${limit}` : ""}</span>
                    </div>
                    <div className="flex-1 p-2 space-y-2 min-h-[100px]">
                      {cards.map((ini, idx) => (
                        <Draggable key={ini.id} draggableId={ini.id} index={idx} isDragDisabled={!canEdit}>
                          {(prov) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              className="bg-card rounded-md border p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                              onClick={() => setDetailId(ini.id)}
                            >
                              <p className="text-sm font-medium mb-2 line-clamp-2">{ini.title}</p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {ini.wsjf_score != null && <Badge className="bg-primary text-primary-foreground text-xs">{ini.wsjf_score.toFixed(1)}</Badge>}
                                {ini.owner_name && (
                                  <div className="h-6 w-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold">
                                    {ini.owner_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                  </div>
                                )}
                                {ini.due_date && (
                                  <span className={`text-xs ${new Date(ini.due_date) < new Date() ? "text-destructive" : "text-muted-foreground"}`}>
                                    {ini.due_date}
                                  </span>
                                )}
                              </div>
                              {stage === "analysis" && ini.lbc_decision && (
                                <Badge className={`mt-1.5 text-xs text-primary-foreground ${DECISION_COLOR[ini.lbc_decision] || ""}`}>
                                  {ini.lbc_decision.replace(/_/g, " ")}
                                </Badge>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      <SlideOver open={!!detailId} onClose={() => setDetailId(null)} title={detail?.title || "Initiative"}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Stage:</span> {detail.stage}</div>
            <div><span className="text-muted-foreground">Owner:</span> {detail.owner_name || "—"}</div>
            <div><span className="text-muted-foreground">WSJF Score:</span> {detail.wsjf_score?.toFixed(2) ?? "—"}</div>
            <div><span className="text-muted-foreground">Description:</span> {detail.description || "—"}</div>
            <div><span className="text-muted-foreground">Risk:</span> {detail.risk_level || "—"}</div>
            <div><span className="text-muted-foreground">LBC Decision:</span> {detail.lbc_decision || "—"}</div>
            <div><span className="text-muted-foreground">Due Date:</span> {detail.due_date || "—"}</div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
