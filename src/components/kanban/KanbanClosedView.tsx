import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/shared/SlideOver";
import type { Initiative } from "@/types/database";

export default function KanbanClosedView() {
  const { clientId, role, session } = useAuth();
  const isAdmin = role === "admin";
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [closedDates, setClosedDates] = useState<Record<string, string>>({});
  const [lbcNumbers, setLbcNumbers] = useState<Record<string, number>>({});
  const [detailId, setDetailId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    const { data: inits } = await supabase
      .from("initiatives").select("*")
      .eq("client_id", clientId)
      .eq("stage", "closed");
    const list = (inits as Initiative[]) || [];
    setInitiatives(list);

    if (list.length > 0) {
      const ids = list.map(i => i.id);
      const [{ data: transitions }, { data: lbcs }] = await Promise.all([
        supabase.from("kanban_stage_transitions").select("initiative_id, changed_at")
          .eq("to_stage", "closed").in("initiative_id", ids)
          .order("changed_at", { ascending: false }),
        supabase.from("lean_business_cases").select("initiative_id, lbc_number").in("initiative_id", ids),
      ]);
      const dateMap: Record<string, string> = {};
      for (const t of (transitions || []) as any[]) {
        if (!dateMap[t.initiative_id]) dateMap[t.initiative_id] = t.changed_at;
      }
      setClosedDates(dateMap);
      const numMap: Record<string, number> = {};
      for (const l of (lbcs || []) as any[]) {
        if (l.lbc_number) numMap[l.initiative_id] = l.lbc_number;
      }
      setLbcNumbers(numMap);
    }
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function moveToDeployed(id: string) {
    await supabase.from("initiatives").update({ stage: "deployed" }).eq("id", id);
    await supabase.from("kanban_stage_transitions").insert({
      client_id: clientId, initiative_id: id,
      from_stage: "closed", to_stage: "deployed",
      changed_by: session?.user?.id, changed_at: new Date().toISOString(),
    });
    fetchData();
  }

  const detail = initiatives.find(i => i.id === detailId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-primary">Closed Initiatives</h1>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>LBC No.</TableHead>
              <TableHead>Initiative Name</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Date Closed</TableHead>
              <TableHead className="text-center">Final WSJF</TableHead>
              <TableHead>LBC Decision</TableHead>
              {isAdmin && <TableHead className="w-24"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {initiatives.map(ini => {
              const lbcNum = lbcNumbers[ini.id];
              const closedAt = closedDates[ini.id];
              return (
                <TableRow key={ini.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailId(ini.id)}>
                  <TableCell>{lbcNum ? `LBC-${String(lbcNum).padStart(3, "0")}` : "—"}</TableCell>
                  <TableCell className="font-medium">{ini.title}</TableCell>
                  <TableCell>{ini.owner_name || "—"}</TableCell>
                  <TableCell>{closedAt ? new Date(closedAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-center font-bold">{ini.wsjf_score?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell>
                    {ini.lbc_decision ? (
                      <Badge variant="outline">{ini.lbc_decision.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</Badge>
                    ) : "—"}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button
                        size="sm" variant="outline"
                        onClick={e => { e.stopPropagation(); moveToDeployed(ini.id); }}
                      >
                        Reopen
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!initiatives.length && (
              <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">No closed initiatives</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <SlideOver open={!!detailId} onClose={() => setDetailId(null)} title={detail?.title || "Initiative"}>
        {detail && (
          <div className="space-y-3 text-sm">
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
