import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/shared/SlideOver";
import type { Initiative } from "@/types/database";

export default function KanbanArchiveView() {
  const { clientId, role, session } = useAuth();
  const isAdmin = role === "admin";
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [archivedDates, setArchivedDates] = useState<Record<string, string>>({});
  const [lbcNumbers, setLbcNumbers] = useState<Record<string, number>>({});
  const [detailId, setDetailId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    const { data: inits } = await supabase
      .from("initiatives").select("*")
      .eq("client_id", clientId)
      .eq("stage", "archive");
    const list = (inits as Initiative[]) || [];
    setInitiatives(list);

    if (list.length > 0) {
      const ids = list.map(i => i.id);
      const [{ data: transitions }, { data: lbcs }] = await Promise.all([
        supabase.from("kanban_stage_transitions").select("initiative_id, changed_at")
          .eq("to_stage", "archive").in("initiative_id", ids)
          .order("changed_at", { ascending: false }),
        supabase.from("lean_business_cases").select("initiative_id, lbc_number").in("initiative_id", ids),
      ]);
      const dateMap: Record<string, string> = {};
      for (const t of (transitions || []) as any[]) {
        if (!dateMap[t.initiative_id]) dateMap[t.initiative_id] = t.changed_at;
      }
      setArchivedDates(dateMap);
      const numMap: Record<string, number> = {};
      for (const l of (lbcs || []) as any[]) {
        if (l.lbc_number) numMap[l.initiative_id] = l.lbc_number;
      }
      setLbcNumbers(numMap);
    }
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function moveToReview(id: string) {
    await supabase.from("initiatives").update({ stage: "review" }).eq("id", id);
    await supabase.from("kanban_stage_transitions").insert({
      client_id: clientId, initiative_id: id,
      from_stage: "archive", to_stage: "review",
      changed_by: session?.user?.id, changed_at: new Date().toISOString(),
    });
    fetchData();
  }

  const detail = initiatives.find(i => i.id === detailId);

  function reason(ini: Initiative) {
    if (ini.lbc_decision === "not_approved") return "Not Approved";
    return "Stopped";
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-primary">Archived Initiatives</h1>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>LBC No.</TableHead>
              <TableHead>Initiative Name</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Date Archived</TableHead>
              <TableHead className="text-center">Original WSJF</TableHead>
              {isAdmin && <TableHead className="w-24"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {initiatives.map(ini => {
              const lbcNum = lbcNumbers[ini.id];
              const archivedAt = archivedDates[ini.id];
              return (
                <TableRow key={ini.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailId(ini.id)}>
                  <TableCell>{lbcNum ? `LBC-${String(lbcNum).padStart(3, "0")}` : "—"}</TableCell>
                  <TableCell className="font-medium">{ini.title}</TableCell>
                  <TableCell><Badge variant="outline">{reason(ini)}</Badge></TableCell>
                  <TableCell>{archivedAt ? new Date(archivedAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-center">{ini.wsjf_score?.toFixed(2) ?? "—"}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button
                        size="sm" variant="outline"
                        onClick={e => { e.stopPropagation(); moveToReview(ini.id); }}
                      >
                        Reactivate
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!initiatives.length && (
              <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">No archived initiatives</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <SlideOver open={!!detailId} onClose={() => setDetailId(null)} title={detail?.title || "Initiative"}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Reason:</span> {reason(detail)}</div>
            <div><span className="text-muted-foreground">Owner:</span> {detail.owner_name || "—"}</div>
            <div><span className="text-muted-foreground">WSJF Score:</span> {detail.wsjf_score?.toFixed(2) ?? "—"}</div>
            <div><span className="text-muted-foreground">Description:</span> {detail.description || "—"}</div>
            <div><span className="text-muted-foreground">LBC Decision:</span> {detail.lbc_decision?.replace(/_/g, " ") || "—"}</div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
