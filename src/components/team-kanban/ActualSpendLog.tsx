import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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

type Category = "labor" | "materials" | "contracting" | "other";

interface SpendRow {
  id: string;
  spend_date: string;
  spend_category: Category;
  spend_amount: number;
  pi_id: string | null;
  notes: string | null;
  recorded_by: string | null;
}

interface PIRow {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
}

interface Props {
  clientId: string;
  initiativeId: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  labor: "Labor",
  materials: "Materials",
  contracting: "Contracting",
  other: "Other",
};

const fmtCurrency = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ActualSpendLog({ clientId, initiativeId }: Props) {
  const { role, profile } = useAuth();
  const isAdmin = role === "admin";
  const isViewer = role === "viewer";

  const [rows, setRows] = useState<SpendRow[]>([]);
  const [pis, setPis] = useState<PIRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId || !initiativeId) return;
    setLoading(true);
    try {
      const [{ data: spendData, error: spendErr }, { data: piData }] = await Promise.all([
        supabase
          .from("initiative_actual_spend")
          .select("id, spend_date, spend_category, spend_amount, pi_id, notes, recorded_by")
          .eq("initiative_id", initiativeId)
          .eq("client_id", clientId)
          .order("spend_date", { ascending: false }),
        supabase
          .from("planning_increments")
          .select("id, name, start_date, end_date")
          .eq("client_id", clientId)
          .order("start_date", { ascending: true }),
      ]);
      if (spendErr) throw spendErr;
      const sRows = (spendData as SpendRow[]) ?? [];
      setRows(sRows);
      setPis((piData as PIRow[]) ?? []);

      const userIds = Array.from(
        new Set(sRows.map((r) => r.recorded_by).filter((x): x is string => !!x)),
      );
      if (userIds.length > 0) {
        const { data: pData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", userIds);
        const m = new Map<string, ProfileRow>();
        for (const p of (pData as ProfileRow[]) ?? []) m.set(p.id, p);
        setProfiles(m);
      } else {
        setProfiles(new Map());
      }
    } catch (e: any) {
      console.error("[ActualSpendLog] load error", e);
      toast.error(e?.message ?? "Failed to load spend");
    } finally {
      setLoading(false);
    }
  }, [clientId, initiativeId]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const t = { labor: 0, materials: 0, contracting: 0, other: 0, total: 0 };
    for (const r of rows) {
      const v = Number(r.spend_amount) || 0;
      t[r.spend_category] = (t[r.spend_category] ?? 0) + v;
      t.total += v;
    }
    return t;
  }, [rows]);

  const piMap = useMemo(() => {
    const m = new Map<string, PIRow>();
    for (const p of pis) m.set(p.id, p);
    return m;
  }, [pis]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const { error } = await supabase
        .from("initiative_actual_spend")
        .delete()
        .eq("id", deleteId);
      if (error) throw error;
      toast.success("Spend entry deleted");
      setDeleteId(null);
      await load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to delete entry");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-bold uppercase tracking-wide" style={{ color: "#1B4F72" }}>
            Actual Spend Log
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
            Cumulative spend for this initiative across all cost categories
          </p>
        </div>
        {!isViewer && (
          <Button
            type="button"
            size="sm"
            onClick={() => setAddOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Spend Entry
          </Button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 mt-3">
        <SummaryTile label="Labor" value={totals.labor} />
        <SummaryTile label="Materials" value={totals.materials} />
        <SummaryTile label="Contracting" value={totals.contracting} />
        <SummaryTile label="Total" value={totals.total} highlight />
      </div>

      <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-2 py-2 font-medium">Date</th>
                <th className="text-left px-2 py-2 font-medium">Category</th>
                <th className="text-right px-2 py-2 font-medium">Amount</th>
                <th className="text-left px-2 py-2 font-medium">PI</th>
                <th className="text-left px-2 py-2 font-medium">Notes</th>
                <th className="text-left px-2 py-2 font-medium">Recorded By</th>
                {isAdmin && <th className="px-2 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={isAdmin ? 7 : 6} className="px-2 py-3 text-center text-slate-400">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={isAdmin ? 7 : 6} className="px-2 py-3 text-center text-slate-400 italic">No spend entries yet</td></tr>
              )}
              {!loading && rows.map((r) => {
                const pi = r.pi_id ? piMap.get(r.pi_id) : null;
                const u = r.recorded_by ? profiles.get(r.recorded_by) : null;
                const userName = u
                  ? [u.first_name, u.last_name].filter(Boolean).join(" ") || "—"
                  : "—";
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-2 py-2 whitespace-nowrap">
                      {format(new Date(r.spend_date + "T00:00:00"), "dd MMM yyyy")}
                    </td>
                    <td className="px-2 py-2">{CATEGORY_LABEL[r.spend_category]}</td>
                    <td className="px-2 py-2 text-right font-medium">{fmtCurrency(Number(r.spend_amount))}</td>
                    <td className="px-2 py-2">{pi?.name ?? "—"}</td>
                    <td className="px-2 py-2 max-w-[180px] truncate" title={r.notes ?? ""}>{r.notes ?? "—"}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{userName}</td>
                    {isAdmin && (
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleteId(r.id)}
                          className="text-red-600 hover:text-red-700"
                          aria-label="Delete entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && (
        <AddSpendSlideOver
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSaved={async () => { setAddOpen(false); await load(); }}
          clientId={clientId}
          initiativeId={initiativeId}
          pis={pis}
          recordedBy={profile?.id ?? null}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete spend entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Spend entries are immutable audit records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        background: highlight ? "#1B4F72" : "#F8FAFC",
        borderColor: highlight ? "#1B4F72" : "#E2E8F0",
        color: highlight ? "#fff" : "#1e293b",
      }}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color: highlight ? "#cbd5e1" : "#64748b" }}>
        {label}
      </div>
      <div className="text-[14px] font-bold mt-0.5">{fmtCurrency(value)}</div>
    </div>
  );
}

function AddSpendSlideOver({
  open,
  onClose,
  onSaved,
  clientId,
  initiativeId,
  pis,
  recordedBy,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  clientId: string;
  initiativeId: string;
  pis: PIRow[];
  recordedBy: string | null;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const activePiId = useMemo(() => {
    const now = new Date();
    const active = pis.find((p) => {
      if (!p.start_date || !p.end_date) return false;
      const s = new Date(p.start_date);
      const e = new Date(p.end_date);
      return s <= now && now <= e;
    });
    return active?.id ?? "";
  }, [pis]);

  const [date, setDate] = useState(today);
  const [category, setCategory] = useState<Category>("labor");
  const [amountStr, setAmountStr] = useState("");
  const [piId, setPiId] = useState<string>(activePiId);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setPiId(activePiId); }, [activePiId]);

  const amount = Number(amountStr);
  const valid = amountStr !== "" && !Number.isNaN(amount) && amount >= 0.01 && !!date;

  async function handleSave() {
    if (!valid) return;
    setSubmitting(true);
    setErr(null);
    try {
      const { error } = await supabase.from("initiative_actual_spend").insert({
        client_id: clientId,
        initiative_id: initiativeId,
        pi_id: piId || null,
        spend_amount: Number(amount.toFixed(2)),
        spend_date: date,
        spend_category: category,
        recorded_by: recordedBy,
        notes: notes.trim() ? notes.trim() : null,
      });
      if (error) throw error;
      toast.success("Spend entry recorded");
      await onSaved();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? "Failed to record spend entry");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="p-0 w-full sm:max-w-[480px] overflow-y-auto" style={{ maxWidth: 480 }}>
        <div className="px-6 py-5 border-b">
          <h2 className="text-lg font-semibold" style={{ color: "#1B4F72" }}>Add Spend Entry</h2>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="spend-date">Date</Label>
            <Input id="spend-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="labor">Labor</SelectItem>
                <SelectItem value="materials">Materials</SelectItem>
                <SelectItem value="contracting">Contracting</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="spend-amount">Amount</Label>
            <Input
              id="spend-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Planning Increment</Label>
            <Select value={piId || "__none__"} onValueChange={(v) => setPiId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {pis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="spend-notes">Notes (optional)</Label>
            <Textarea
              id="spend-notes"
              rows={4}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="text-[11px] text-muted-foreground text-right">{notes.length}/500</div>
          </div>

          {err && (
            <div className="rounded px-3 py-2 text-[12px]" style={{ background: "#FEE2E2", color: "#DC2626" }}>
              {err}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-between">
          <Button variant="outline" onClick={onClose} className="border-primary text-primary hover:bg-primary/5">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!valid || submitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting ? "Saving…" : "Save Entry"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
