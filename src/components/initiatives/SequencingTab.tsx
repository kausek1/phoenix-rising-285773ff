import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type ItemType = "feature" | "milestone" | "gate";

interface SeqRow {
  id: string | null;
  item_type: ItemType;
  feature_id: string | null;
  label: string;
  month_start: number;
  notes: string;
  display_order: number;
  _dirty?: boolean;
  _deleted?: boolean;
}

interface FeatureOpt {
  id: string;
  title: string;
}

export default function SequencingTab({ initiativeId }: { initiativeId: string }) {
  const { clientId, role } = useAuth();
  const canEdit = role === "admin" || role === "contributor";
  const [rows, setRows] = useState<SeqRow[]>([]);
  const [features, setFeatures] = useState<FeatureOpt[]>([]);
  const [sequencingNotes, setSequencingNotes] = useState<string>("");
  const [maxMonth, setMaxMonth] = useState<number>(36);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientId || !initiativeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: seq }, { data: feats }, { data: init }, { data: lbc }] = await Promise.all([
        supabase
          .from("initiative_sequencing")
          .select("id, item_type, feature_id, label, month_start, notes, display_order")
          .eq("client_id", clientId)
          .eq("initiative_id", initiativeId)
          .order("display_order", { ascending: true })
          .order("month_start", { ascending: true }),
        supabase
          .from("features")
          .select("id, title")
          .eq("client_id", clientId)
          .eq("initiative_id", initiativeId)
          .order("sort_order"),
        supabase
          .from("initiatives")
          .select("estimated_deploy_months")
          .eq("id", initiativeId)
          .single(),
        supabase
          .from("lean_business_cases")
          .select("sequencing_dependencies")
          .eq("initiative_id", initiativeId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setRows(
        ((seq as any[]) ?? []).map((r) => ({
          id: r.id,
          item_type: r.item_type,
          feature_id: r.feature_id,
          label: r.label ?? "",
          month_start: r.month_start ?? 1,
          notes: r.notes ?? "",
          display_order: r.display_order ?? 0,
        })),
      );
      setFeatures((feats as FeatureOpt[]) ?? []);
      const dep = (init as any)?.estimated_deploy_months ?? 12;
      setMaxMonth((dep ?? 12) + 6);
      setSequencingNotes(((lbc as any)?.sequencing_dependencies as string) ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, initiativeId]);

  const updateRow = (idx: number, patch: Partial<SeqRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, _dirty: true } : r)));
  };

  const addRow = (item_type: ItemType) => {
    setRows((prev) => [
      ...prev,
      {
        id: null,
        item_type,
        feature_id: null,
        label: "",
        month_start: 1,
        notes: "",
        display_order: prev.length,
        _dirty: true,
      },
    ]);
  };

  const deleteRow = (idx: number) => {
    setRows((prev) => {
      const r = prev[idx];
      if (!r.id) {
        return prev.filter((_, i) => i !== idx);
      }
      return prev.map((row, i) => (i === idx ? { ...row, _deleted: true } : row));
    });
  };

  const usedFeatureIds = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      if (r._deleted) return;
      if (r.item_type === "feature" && r.feature_id) {
        m.set(r.feature_id, (m.get(r.feature_id) ?? 0) + 1);
      }
    });
    return m;
  }, [rows]);

  const handleSave = async () => {
    if (!clientId) return;
    // Validation
    for (const r of rows) {
      if (r._deleted) continue;
      if (r.item_type === "feature" && !r.feature_id) {
        toast.error("Every feature row must have a feature selected.");
        return;
      }
      if ((r.item_type === "milestone" || r.item_type === "gate") && !r.label.trim()) {
        toast.error("Milestones and gates require a label.");
        return;
      }
      if (!r.month_start || r.month_start < 1) {
        toast.error("Every row must have a start month ≥ 1.");
        return;
      }
    }
    for (const [, count] of usedFeatureIds) {
      if (count > 1) {
        toast.error("Duplicate feature in sequence. Each feature can appear only once.");
        return;
      }
    }

    setSaving(true);
    try {
      // Deletes
      const toDelete = rows.filter((r) => r._deleted && r.id).map((r) => r.id!) as string[];
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("initiative_sequencing")
          .delete()
          .in("id", toDelete);
        if (error) throw error;
      }

      const toUpsert = rows
        .filter((r) => !r._deleted)
        .map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          client_id: clientId,
          initiative_id: initiativeId,
          item_type: r.item_type,
          feature_id: r.item_type === "feature" ? r.feature_id : null,
          label: r.item_type === "feature" ? null : r.label.trim(),
          month_start: r.month_start,
          notes: r.notes || null,
          display_order: r.display_order ?? 0,
        }));

      if (toUpsert.length > 0) {
        const { data, error } = await supabase
          .from("initiative_sequencing")
          .upsert(toUpsert)
          .select("id, item_type, feature_id, label, month_start, notes, display_order");
        if (error) throw error;
        setRows(
          ((data as any[]) ?? []).map((r) => ({
            id: r.id,
            item_type: r.item_type,
            feature_id: r.feature_id,
            label: r.label ?? "",
            month_start: r.month_start ?? 1,
            notes: r.notes ?? "",
            display_order: r.display_order ?? 0,
          })),
        );
      } else {
        setRows((prev) => prev.filter((r) => !r._deleted));
      }
      toast.success("Sequencing saved.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save sequencing");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const visibleRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r._deleted);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-700">Timeline Editor</div>
        <div className="overflow-x-auto border border-slate-200 rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-2 py-2 font-medium">Type</th>
                <th className="text-left px-2 py-2 font-medium">Feature</th>
                <th className="text-left px-2 py-2 font-medium">Label</th>
                <th className="text-left px-2 py-2 font-medium w-24">Start Month</th>
                <th className="text-left px-2 py-2 font-medium">Notes</th>
                <th className="text-left px-2 py-2 font-medium w-20">Order</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                    No sequencing items yet.
                  </td>
                </tr>
              )}
              {visibleRows.map(({ r, i }) => (
                <tr key={r.id ?? `new-${i}`} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2">
                    <Badge
                      variant="outline"
                      className={
                        r.item_type === "feature"
                          ? "border-blue-300 text-blue-700"
                          : r.item_type === "milestone"
                          ? "border-amber-300 text-amber-700"
                          : "border-red-300 text-red-700"
                      }
                    >
                      {r.item_type}
                    </Badge>
                  </td>
                  <td className="px-2 py-2">
                    {r.item_type === "feature" ? (
                      <Select
                        value={r.feature_id ?? "__none__"}
                        onValueChange={(v) =>
                          updateRow(i, { feature_id: v === "__none__" ? null : v })
                        }
                        disabled={!canEdit}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select feature…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Select —</SelectItem>
                          {features.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {r.item_type === "feature" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Input
                        value={r.label}
                        onChange={(e) => updateRow(i, { label: e.target.value })}
                        className="h-8 text-xs"
                        disabled={!canEdit}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      min={1}
                      max={maxMonth}
                      value={r.month_start}
                      onChange={(e) =>
                        updateRow(i, { month_start: parseInt(e.target.value, 10) || 1 })
                      }
                      className="h-8 text-xs"
                      disabled={!canEdit}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      value={r.notes}
                      onChange={(e) => updateRow(i, { notes: e.target.value })}
                      className="h-8 text-xs"
                      disabled={!canEdit}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      value={r.display_order}
                      onChange={(e) =>
                        updateRow(i, { display_order: parseInt(e.target.value, 10) || 0 })
                      }
                      className="h-8 text-xs"
                      disabled={!canEdit}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => deleteRow(i)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Delete row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => addRow("feature")}>
              <Plus className="h-3 w-3 mr-1" /> Add Feature
            </Button>
            <Button size="sm" variant="outline" onClick={() => addRow("milestone")}>
              <Plus className="h-3 w-3 mr-1" /> Add Milestone
            </Button>
            <Button size="sm" variant="outline" onClick={() => addRow("gate")}>
              <Plus className="h-3 w-3 mr-1" /> Add Gate
            </Button>
            <div className="ml-auto">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                {saving ? "Saving…" : "Save Sequencing"}
              </Button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Max start month: {maxMonth} (estimated_deploy_months + 6).
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold text-slate-700">
          Sequencing Notes (LBC narrative)
        </div>
        <Textarea
          value={sequencingNotes}
          readOnly
          rows={5}
          className="text-xs bg-slate-50"
          placeholder="(No sequencing narrative recorded in the LBC.)"
        />
        <p className="text-[11px] text-muted-foreground">
          This is the narrative from the LBC document. The structured timeline above is the
          live sequencing record.
        </p>
      </div>
    </div>
  );
}
