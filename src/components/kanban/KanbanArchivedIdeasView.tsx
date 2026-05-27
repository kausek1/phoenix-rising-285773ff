import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/shared/SlideOver";
import { toast } from "sonner";
import { Lightbulb, Undo2 } from "lucide-react";
import type { Initiative } from "@/types/database";

export default function KanbanArchivedIdeasView() {
  const { clientId, role, session } = useAuth();
  const canEdit = role === "admin" || role === "contributor";
  const [ideas, setIdeas] = useState<Initiative[]>([]);
  const [archivedDates, setArchivedDates] = useState<Record<string, string>>({});
  const [detailId, setDetailId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase
      .from("initiatives").select("*")
      .eq("client_id", clientId)
      .eq("stage", "archive")
      .eq("initiative_type", "idea");
    const list = (data as Initiative[]) || [];
    setIdeas(list);

    if (list.length > 0) {
      const ids = list.map(i => i.id);
      const { data: transitions } = await supabase
        .from("kanban_stage_transitions").select("initiative_id, changed_at")
        .eq("to_stage", "archive").in("initiative_id", ids)
        .order("changed_at", { ascending: false });
      const dateMap: Record<string, string> = {};
      for (const t of (transitions || []) as any[]) {
        if (!dateMap[t.initiative_id]) dateMap[t.initiative_id] = t.changed_at;
      }
      setArchivedDates(dateMap);
    }
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function restore(ini: Initiative) {
    const { error } = await supabase.from("initiatives").update({ stage: "funnel" }).eq("id", ini.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("kanban_stage_transitions").insert({
      client_id: clientId, initiative_id: ini.id,
      from_stage: "archive", to_stage: "funnel",
      changed_by: session?.user?.id, changed_at: new Date().toISOString(),
    });
    toast.success(`${ini.title} restored to Funnel`);
    fetchData();
  }

  const detail = ideas.find(i => i.id === detailId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-amber-600" /> Archived Ideas
      </h1>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Idea</TableHead>
              <TableHead>Sponsor</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Archived</TableHead>
              {canEdit && <TableHead className="w-40"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ideas.map(ini => {
              const at = archivedDates[ini.id];
              return (
                <TableRow key={ini.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailId(ini.id)}>
                  <TableCell className="font-medium">{ini.title}</TableCell>
                  <TableCell>{ini.owner_name || "—"}</TableCell>
                  <TableCell>{ini.created_at ? new Date(ini.created_at).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{at ? new Date(at).toLocaleDateString() : "—"}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button
                        size="sm" variant="outline"
                        onClick={e => { e.stopPropagation(); restore(ini); }}
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" /> Restore to Funnel
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!ideas.length && (
              <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center text-muted-foreground py-8">No archived ideas</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <SlideOver open={!!detailId} onClose={() => setDetailId(null)} title={detail?.title || "Idea"}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Sponsor:</span> {detail.owner_name || "—"}</div>
            <div><span className="text-muted-foreground">Description:</span> {detail.description || "—"}</div>
            <div><span className="text-muted-foreground">Created:</span> {detail.created_at ? new Date(detail.created_at).toLocaleDateString() : "—"}</div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
