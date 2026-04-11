import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SlideOver } from "@/components/shared/SlideOver";
import { Plus } from "lucide-react";
import LBCForm from "./LBCForm";
import type { Initiative } from "@/types/database";

const DECISION_COLOR: Record<string, string> = {
  approved: "bg-success text-success-foreground",
  pivot: "bg-warning text-warning-foreground",
  deferred: "bg-muted-foreground text-primary-foreground",
  not_approved: "bg-destructive text-destructive-foreground",
};

export default function LBCModule() {
  const { clientId, role } = useAuth();
  const canEdit = role === "admin" || role === "contributor";
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase.from("initiatives").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
    setInitiatives((data as Initiative[]) || []);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Lean Business Case</h1>
        {canEdit && (
          <Button size="sm" onClick={() => { setEditId(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Initiative
          </Button>
        )}
      </div>

      <Table>
        <TableHeader><TableRow>
          <TableHead>Title</TableHead><TableHead>Stage</TableHead>
          <TableHead>LBC Decision</TableHead><TableHead>WSJF Score</TableHead>
          <TableHead>Owner</TableHead><TableHead>Funnel Entry</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {initiatives.map(i => (
            <TableRow key={i.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setEditId(i.id); setFormOpen(true); }}>
              <TableCell className="font-medium">{i.title}</TableCell>
              <TableCell><Badge variant="outline">{i.stage}</Badge></TableCell>
              <TableCell>
                {i.lbc_decision && <Badge className={DECISION_COLOR[i.lbc_decision] || ""}>{i.lbc_decision}</Badge>}
              </TableCell>
              <TableCell>{i.wsjf_score?.toFixed(2) ?? "—"}</TableCell>
              <TableCell>{i.owner_name || "—"}</TableCell>
              <TableCell>{i.funnel_entry_date || "—"}</TableCell>
            </TableRow>
          ))}
          {!initiatives.length && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No initiatives yet</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <SlideOver open={formOpen} onClose={() => setFormOpen(false)} title={editId ? "Edit Initiative" : "New Initiative"}>
        <LBCForm clientId={clientId} editId={editId} onSaved={() => { setFormOpen(false); fetch(); }} />
      </SlideOver>
    </div>
  );
}
