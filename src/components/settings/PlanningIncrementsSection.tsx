import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CalendarRange } from "lucide-react";

interface PI {
  id: string;
  client_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

const QUARTERS = [1, 2, 3, 4] as const;
type Q = (typeof QUARTERS)[number];

function quarterDates(year: number, q: Q): { start: string; end: string } {
  const map: Record<Q, [string, string]> = {
    1: [`${year}-01-01`, `${year}-03-31`],
    2: [`${year}-04-01`, `${year}-06-30`],
    3: [`${year}-07-01`, `${year}-09-30`],
    4: [`${year}-10-01`, `${year}-12-31`],
  };
  const [start, end] = map[q];
  return { start, end };
}

function piName(year: number, q: Q) {
  return `PI-${year}-Q${q}`;
}

interface DraftState {
  id?: string;
  name: string;
  quarter: Q;
  year: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export default function PlanningIncrementsSection({ clientId }: { clientId: string | null }) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<PI[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<DraftState | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkYear, setBulkYear] = useState<number>(new Date().getFullYear() + 1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    const { data, error } = await supabase
      .from("planning_increments")
      .select("id, client_id, name, start_date, end_date, is_active")
      .eq("client_id", clientId)
      .order("start_date", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoaded(true);
      return;
    }
    setRows((data ?? []) as PI[]);
    setLoaded(true);
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  if (!isAdmin) return null;
  if (!clientId) return null;
  if (!loaded) return <p className="text-sm text-muted-foreground p-4">Loading planning increments…</p>;

  const openNew = () => {
    const year = new Date().getFullYear() + 1;
    const q: Q = 1;
    const d = quarterDates(year, q);
    setEditing({ name: piName(year, q), quarter: q, year, start_date: d.start, end_date: d.end, is_active: false });
  };

  const openEdit = (r: PI) => {
    // Try to derive quarter/year from start_date
    const dt = new Date(r.start_date);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const q = (m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4) as Q;
    setEditing({
      id: r.id,
      name: r.name,
      quarter: q,
      year: y,
      start_date: r.start_date,
      end_date: r.end_date,
      is_active: !!r.is_active,
    });
  };

  const updateQy = (year: number, quarter: Q) => {
    if (!editing) return;
    const d = quarterDates(year, quarter);
    setEditing({ ...editing, year, quarter, name: piName(year, quarter), start_date: d.start, end_date: d.end });
  };

  const handleSave = async () => {
    if (!editing || !clientId || saving) return;
    setSaving(true);
    try {
      const payload = {
        client_id: clientId,
        name: editing.name.trim(),
        start_date: editing.start_date,
        end_date: editing.end_date,
        is_active: editing.is_active,
      };
      // If marking active, deactivate all others first
      if (editing.is_active) {
        const { error: dErr } = await (supabase as any)
          .from("planning_increments")
          .update({ is_active: false })
          .eq("client_id", clientId)
          .neq("id", editing.id ?? "00000000-0000-0000-0000-000000000000");
        if (dErr) throw dErr;
      }
      if (editing.id) {
        const { error } = await (supabase as any)
          .from("planning_increments")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("planning_increments")
          .insert(payload);
        if (error) throw error;
      }
      toast.success("Planning increment saved");
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save planning increment");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkCreate = async () => {
    if (!clientId || saving) return;
    setSaving(true);
    try {
      // Find existing start_dates for that year
      const yearStart = `${bulkYear}-01-01`;
      const yearEnd = `${bulkYear}-12-31`;
      const { data: existing } = await supabase
        .from("planning_increments")
        .select("start_date")
        .eq("client_id", clientId)
        .gte("start_date", yearStart)
        .lte("start_date", yearEnd);
      const existingStarts = new Set((existing ?? []).map((r: any) => r.start_date));
      const toInsert = QUARTERS
        .map((q) => {
          const d = quarterDates(bulkYear, q);
          return { client_id: clientId, name: piName(bulkYear, q), start_date: d.start, end_date: d.end, is_active: false };
        })
        .filter((r) => !existingStarts.has(r.start_date));
      if (toInsert.length === 0) {
        toast.info("All quarters already exist for that year");
      } else {
        const { error } = await (supabase as any).from("planning_increments").insert(toInsert);
        if (error) throw error;
        toast.success(`Created ${toInsert.length} planning increment(s)`);
      }
      setBulkOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to bulk-create planning increments");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !clientId) return;
    try {
      const { count, error: cErr } = await (supabase as any)
        .from("features")
        .select("id", { count: "exact", head: true })
        .eq("planned_pi_id", deleteId);
      if (cErr) throw cErr;
      if ((count ?? 0) > 0) {
        toast.error(`This PI is referenced by ${count} features. Reassign them before deleting.`);
        setDeleteId(null);
        return;
      }
      const { error } = await (supabase as any)
        .from("planning_increments")
        .delete()
        .eq("id", deleteId);
      if (error) throw error;
      toast.success("Planning increment deleted");
      setDeleteId(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete planning increment");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Planning Increments</CardTitle>
          <CardDescription>
            Manage quarterly planning increments. Only one PI may be active at a time.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setBulkYear(new Date().getFullYear() + 1); setBulkOpen(true); }}>
            <CalendarRange className="h-4 w-4 mr-2" /> Create Full Year
          </Button>
          <Button size="sm" onClick={openNew} className="bg-[hsl(160,80%,27%)] hover:bg-[hsl(160,80%,22%)] text-white">
            <Plus className="h-4 w-4 mr-2" /> New PI
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No planning increments yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.start_date}</TableCell>
                  <TableCell>{r.end_date}</TableCell>
                  <TableCell>
                    {r.is_active ? <Badge>Active</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Edit / New dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Planning Increment" : "New Planning Increment"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quarter</Label>
                  <Select value={String(editing.quarter)} onValueChange={(v) => updateQy(editing.year, Number(v) as Q)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUARTERS.map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Year</Label>
                  <Input
                    type="number"
                    value={editing.year}
                    onChange={(e) => updateQy(parseInt(e.target.value) || editing.year, editing.quarter)}
                  />
                </div>
              </div>
              <div>
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={editing.start_date} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={editing.end_date} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <Label>Active (deactivates all others)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[hsl(160,80%,27%)] hover:bg-[hsl(160,80%,22%)] text-white">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk create dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Full Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Year</Label>
            <Input type="number" value={bulkYear} onChange={(e) => setBulkYear(parseInt(e.target.value) || bulkYear)} />
            <p className="text-sm text-muted-foreground">
              Will create Q1–Q4 for {bulkYear}, skipping any quarters that already exist.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkCreate} disabled={saving} className="bg-[hsl(160,80%,27%)] hover:bg-[hsl(160,80%,22%)] text-white">
              {saving ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        title="Delete planning increment?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </Card>
  );
}
