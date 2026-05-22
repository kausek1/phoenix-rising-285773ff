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

interface SeqRow {
  id: string | null;
  feature_id: string | null;
  month_start: number;
  _dirty?: boolean;
  _deleted?: boolean;
}

interface FeatureOpt {
  id: string;
  title: string;
  duration_months: number | null;
  is_mvp: boolean | null;
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
          .select("id, item_type, feature_id, month_start")
          .eq("client_id", clientId)
          .eq("initiative_id", initiativeId)
          .eq("item_type", "feature")
          .order("month_start", { ascending: true }),
        supabase
          .from("features")
          .select("id, title, duration_months, feature_type")
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
          feature_id: r.feature_id,
          month_start: r.month_start ?? 1,
        })),
      );
      setFeatures(
        ((feats as any[]) ?? []).map((f) => ({
          id: f.id,
          title: f.title,
          duration_months: f.duration_months ?? null,
          is_mvp: f.feature_type === "mvp",
        })),
      );
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

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: null,
        feature_id: null,
        month_start: 1,
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

  const featureMap = useMemo(() => {
    const m = new Map<string, FeatureOpt>();
    features.forEach((f) => m.set(f.id, f));
    return m;
  }, [features]);

  const usedFeatureIds = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      if (r._deleted) return;
      if (r.feature_id) {
        m.set(r.feature_id, (m.get(r.feature_id) ?? 0) + 1);
      }
    });
    return m;
  }, [rows]);

  const handleSave = async () => {
    if (!clientId) return;
    for (const r of rows) {
      if (r._deleted) continue;
      if (!r.feature_id) {
        toast.error("Every row must have a feature selected.");
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
      const toUpsert = rows
        .filter((r) => !r._deleted && r.feature_id)
        .map((r) => {
          if (!clientId) throw new Error("Missing client_id in session context.");
          return {
            ...(r.id ? { id: r.id } : {}),
            client_id: clientId,
            initiative_id: initiativeId,
            item_type: "feature" as const,
            feature_id: r.feature_id as string,
            month_start: r.month_start,
          };
        });

      if (toUpsert.some((r) => !r.client_id)) {
        toast.error("client_id missing on sequencing row.");
        return;
      }

      const keepFeatureIds = toUpsert.map((r) => r.feature_id);
      // Delete rows in DB for this initiative that are not in the current payload
      let deleteQuery = supabase
        .from("initiative_sequencing")
        .delete()
        .eq("client_id", clientId)
        .eq("initiative_id", initiativeId)
        .eq("item_type", "feature");
      if (keepFeatureIds.length > 0) {
        deleteQuery = deleteQuery.not(
          "feature_id",
          "in",
          `(${keepFeatureIds.map((id) => `"${id}"`).join(",")})`,
        );
      }
      const { error: delErr } = await deleteQuery;
      if (delErr) throw delErr;

      if (toUpsert.length > 0) {
        const { data, error } = await supabase
          .from("initiative_sequencing")
          .upsert(toUpsert, { onConflict: 'initiative_id,feature_id' })
          .select("id, feature_id, month_start");
        if (error) throw error;
        setRows(
          ((data as any[]) ?? []).map((r) => ({
            id: r.id,
            feature_id: r.feature_id,
            month_start: r.month_start ?? 1,
          })),
        );
      } else {
        setRows([]);
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
                <th className="text-left px-2 py-2 font-medium">Feature</th>
                <th className="text-left px-2 py-2 font-medium w-24">MVP</th>
                <th className="text-left px-2 py-2 font-medium w-24">Duration</th>
                <th className="text-left px-2 py-2 font-medium w-28">Start Month</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                    No sequencing items yet.
                  </td>
                </tr>
              )}
              {visibleRows.map(({ r, i }) => {
                const f = r.feature_id ? featureMap.get(r.feature_id) : undefined;
                return (
                  <tr key={r.id ?? `new-${i}`} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-2">
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
                          {features.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      {f ? (
                        f.is_mvp ? (
                          <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
                            MVP
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-300 text-slate-600 bg-slate-50">
                            Post-MVP
                          </Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-slate-700">
                      {f && f.duration_months != null ? `${f.duration_months} mo` : "—"}
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
                );
              })}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus className="h-3 w-3 mr-1" /> Add Feature
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
