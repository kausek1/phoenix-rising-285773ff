import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, CheckSquare, Layout, Lock, Save, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { FeatureStatus, FeatureType } from "@/types/features";
import { fmtPiOption, fmtDate, type PI } from "@/lib/portfolio-status";

interface FeaturesTabProps {
  initiativeId: string;
  clientId: string;
}

const STATUS_STYLES: Record<FeatureStatus, { cls: string; label: string }> = {
  backlog: { cls: "bg-gray-100 text-gray-600", label: "Backlog" },
  in_progress: { cls: "bg-blue-50 text-blue-700", label: "In Progress" },
  done: { cls: "bg-green-50 text-green-700", label: "Done" },
  cancelled: { cls: "bg-red-50 text-red-500", label: "Cancelled" },
};

interface FeatureRowFull {
  id: string;
  feature_type: FeatureType;
  title: string;
  acceptance_criteria: string | null;
  status: FeatureStatus;
  sort_order: number;
  planned_pi_id: string | null;
  pi_locked: boolean | null;
  pi_locked_at: string | null;
  pi_locked_by: string | null;
}

type PiOption =
  | { kind: "real"; id: string; label: string; year: number; quarter: number | null }
  | { kind: "synthetic"; id: string; label: string; year: number; quarter: number };

function quarterFromDate(d: string | null): number | null {
  if (!d) return null;
  const m = new Date(d).getUTCMonth();
  return Math.floor(m / 3) + 1;
}

function buildPiOptions(pis: PI[]): PiOption[] {
  const now = new Date();
  const y0 = now.getUTCFullYear();
  const years = [y0, y0 + 1, y0 + 2];
  const real: PiOption[] = pis.map((p) => ({
    kind: "real" as const,
    id: p.id,
    label: fmtPiOption(p),
    year: p.start_date ? new Date(p.start_date).getUTCFullYear() : y0,
    quarter: quarterFromDate(p.start_date),
  }));
  const occupied = new Set(
    real
      .filter((r) => r.quarter != null && years.includes(r.year))
      .map((r) => `${r.year}:Q${r.quarter}`),
  );
  const monthsByQ: Record<number, string> = { 1: "Jan–Mar", 2: "Apr–Jun", 3: "Jul–Sep", 4: "Oct–Dec" };
  const synthetic: PiOption[] = [];
  for (const y of years) {
    for (let q = 1; q <= 4; q++) {
      const key = `${y}:Q${q}`;
      if (occupied.has(key)) continue;
      synthetic.push({
        kind: "synthetic",
        id: `syn:${y}:Q${q}`,
        label: `Q${q} ${y} (${monthsByQ[q]} ${y})`,
        year: y,
        quarter: q,
      });
    }
  }
  const all = [...real, ...synthetic];
  all.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    const aq = a.quarter ?? 0;
    const bq = b.quarter ?? 0;
    return aq - bq;
  });
  return all;
}

function StatusBadge({ status }: { status: FeatureStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.backlog;
  return (
    <span
      className={`${s.cls} text-xs font-medium px-2 py-0.5 rounded-full w-24 flex-shrink-0 text-center`}
    >
      {s.label}
    </span>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#1B4F72" }}>
      {children}
    </h3>
  );
}

interface DraftState {
  is_mvp: boolean; // derived from feature_type === 'mvp'
  planned_pi_value: string; // either real PI uuid, "syn:YYYY:QN", or "__none__"
}

function FeatureItem({
  row,
  index,
  options,
  canEdit,
  isAdmin,
  lockerName,
  onSave,
  onToggleLock,
}: {
  row: FeatureRowFull;
  index: number;
  options: PiOption[];
  canEdit: boolean;
  isAdmin: boolean;
  lockerName: string | null;
  onSave: (
    draft: DraftState,
  ) => Promise<{ ok: boolean; warn?: string; error?: string }>;
  onToggleLock: () => Promise<void>;
}) {
  const ac = (row.acceptance_criteria || "").trim();
  const initialMvp = row.feature_type === "mvp";
  const initialPi = row.planned_pi_id ?? "__none__";
  const locked = !!row.pi_locked;

  const [draft, setDraft] = useState<DraftState>({
    is_mvp: initialMvp,
    planned_pi_value: initialPi,
  });
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);

  // Re-sync when underlying row changes externally (e.g. lock toggled)
  useEffect(() => {
    setDraft({ is_mvp: row.feature_type === "mvp", planned_pi_value: row.planned_pi_id ?? "__none__" });
  }, [row.feature_type, row.planned_pi_id]);

  const dirty =
    draft.is_mvp !== initialMvp || draft.planned_pi_value !== initialPi;

  const selectedOpt = options.find((o) => o.id === draft.planned_pi_value);
  const selectedLabel = selectedOpt?.label ?? "—";

  const handleToggleLock = async () => {
    await onToggleLock();
  };

  const handleSave = async () => {
    setSaving(true);
    setErrMsg(null);
    setWarnMsg(null);
    const res = await onSave(draft);
    setSaving(false);
    if (!res.ok) {
      setErrMsg(res.error ?? "Failed to save");
      return;
    }
    if (res.warn) setWarnMsg(res.warn);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  return (
    <div className="bg-white rounded-md border border-gray-100 px-3 py-2 mb-2 shadow-sm">
      <div className="flex items-start gap-3">
        <StatusBadge status={row.status} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 leading-snug">
            {row.title || <span className="italic text-gray-400">Untitled feature</span>}
          </div>
          {ac && (
            <div className="text-xs text-gray-500 mt-1 leading-relaxed">
              <CheckSquare className="w-3 h-3 inline mr-1 text-gray-400" />
              {ac}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <Checkbox
                checked={draft.is_mvp}
                disabled={!canEdit || locked}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, is_mvp: !!v }))}
              />
              MVP Feature
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Planned PI:</span>
              {locked ? (
                <span
                  className="text-xs text-slate-700 inline-flex items-center gap-1"
                  title={
                    lockerName && row.pi_locked_at
                      ? `Locked by ${lockerName} on ${fmtDate(row.pi_locked_at)}. Contact a Portfolio Admin to change.`
                      : "Locked. Contact a Portfolio Admin to change."
                  }
                >
                  <Lock className="h-3 w-3 text-slate-500" />
                  {selectedLabel}
                </span>
              ) : (
                <Select
                  disabled={!canEdit}
                  value={draft.planned_pi_value}
                  onValueChange={(v) => setDraft((d) => ({ ...d, planned_pi_value: v }))}
                >
                  <SelectTrigger className="h-7 text-xs w-[220px]">
                    <SelectValue placeholder="Select PI" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                        {o.kind === "synthetic" ? " · not yet created" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isAdmin && (row.planned_pi_id || draft.planned_pi_value !== "__none__") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  title={locked ? "Unlock PI" : "Lock PI"}
                  onClick={handleToggleLock}
                >
                  {locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                </Button>
              )}
            </div>

            {canEdit && !locked && dirty && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={saving}
                onClick={handleSave}
              >
                <Save className="h-3 w-3 mr-1" />
                {saving ? "Saving…" : "Save"}
              </Button>
            )}
            {savedFlash && (
              <span className="text-xs text-green-600 inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
            {errMsg && <span className="text-xs text-red-600">{errMsg}</span>}
            {warnMsg && <span className="text-xs text-amber-600">{warnMsg}</span>}
          </div>
        </div>
        <div className="text-xs text-gray-300 flex-shrink-0">{index + 1}</div>
      </div>
    </div>
  );
}

export default function FeaturesTab({ initiativeId, clientId }: FeaturesTabProps) {
  const { role, profile } = useAuth();
  const isAdmin = role === "admin";
  const canEdit = role === "admin" || role === "contributor";

  const [rows, setRows] = useState<FeatureRowFull[]>([]);
  const [pis, setPis] = useState<PI[]>([]);
  const [lockerNames, setLockerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      const now = new Date();
      const startBoundary = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
      const endBoundary = new Date(Date.UTC(now.getUTCFullYear() + 2, 11, 31)).toISOString();

      const [{ data: featData, error: fErr }, { data: piData }] = await Promise.all([
        (supabase as any)
          .from("features")
          .select(
            "id, feature_type, title, acceptance_criteria, status, sort_order, planned_pi_id, pi_locked, pi_locked_at, pi_locked_by",
          )
          .eq("initiative_id", initiativeId)
          .eq("client_id", clientId)
          .order("feature_type", { ascending: true })
          .order("sort_order", { ascending: true }),
        supabase
          .from("planning_increments")
          .select("id, name, start_date, end_date")
          .eq("client_id", clientId)
          .gte("start_date", startBoundary)
          .lte("start_date", endBoundary)
          .order("start_date", { ascending: true }),
      ]);

      if (cancelled) return;
      if (fErr) {
        setError(true);
        setRows([]);
        setLoading(false);
        return;
      }
      const features = (featData as FeatureRowFull[]) || [];
      setRows(features);
      setPis((piData as PI[]) || []);

      const lockerIds = new Set<string>();
      for (const f of features) {
        if (f.pi_locked && f.pi_locked_by) lockerIds.add(f.pi_locked_by);
      }
      if (lockerIds.size > 0) {
        const { data: pData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", Array.from(lockerIds));
        if (!cancelled) {
          const nm: Record<string, string> = {};
          for (const p of (pData ?? []) as { id: string; full_name: string }[]) nm[p.id] = p.full_name;
          setLockerNames(nm);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initiativeId, clientId]);

  const piOptions = useMemo(() => buildPiOptions(pis), [pis]);

  const resolvePlannedPiId = (
    value: string,
  ): { id: string | null; warn?: string } => {
    if (value === "__none__") return { id: null };
    if (!value.startsWith("syn:")) return { id: value };
    const m = /^syn:(\d{4}):Q([1-4])$/.exec(value);
    if (!m) return { id: null };
    const y = Number(m[1]);
    const q = Number(m[2]);
    const match = pis.find((p) => {
      if (!p.start_date) return false;
      const d = new Date(p.start_date);
      return d.getUTCFullYear() === y && Math.floor(d.getUTCMonth() / 3) + 1 === q;
    });
    if (match) return { id: match.id };
    return {
      id: null,
      warn: "This PI has not been created yet. Ask your admin to create it in Settings.",
    };
  };

  const saveFeature = async (
    featureId: string,
    draft: DraftState,
  ): Promise<{ ok: boolean; warn?: string; error?: string }> => {
    const resolved = resolvePlannedPiId(draft.planned_pi_value);
    const newType: FeatureType = draft.is_mvp ? "mvp" : "post_mvp";

    const { data, error } = await (supabase as any)
      .from("features")
      .update({
        planned_pi_id: resolved.id,
        feature_type: newType,
        is_mvp: newType === "mvp",
        updated_at: new Date().toISOString(),
      })
      .eq("id", featureId)
      .eq("client_id", clientId)
      .select(
        "id, feature_type, title, acceptance_criteria, status, sort_order, planned_pi_id, pi_locked, pi_locked_at, pi_locked_by",
      )
      .single();

    if (error) return { ok: false, error: error.message };
    if (data) {
      setRows((prev) => prev.map((r) => (r.id === featureId ? (data as FeatureRowFull) : r)));
    }
    return { ok: true, warn: resolved.warn };
  };

  const toggleLock = async (featureId: string) => {
    const existing = rows.find((r) => r.id === featureId);
    if (!existing) return;
    const newLocked = !existing.pi_locked;
    const now = new Date().toISOString();
    const userId = profile?.id ?? null;

    const { data, error } = await (supabase as any)
      .from("features")
      .update({
        pi_locked: newLocked,
        pi_locked_at: newLocked ? now : null,
        pi_locked_by: newLocked ? userId : null,
        updated_at: now,
      })
      .eq("id", featureId)
      .eq("client_id", clientId)
      .select(
        "id, feature_type, title, acceptance_criteria, status, sort_order, planned_pi_id, pi_locked, pi_locked_at, pi_locked_by",
      )
      .single();

    if (error) {
      toast.error(`Failed to update lock: ${error.message}`);
      return;
    }
    if (data) {
      setRows((prev) => prev.map((r) => (r.id === featureId ? (data as FeatureRowFull) : r)));
      const lockerId = (data as FeatureRowFull).pi_locked_by;
      if (lockerId && !lockerNames[lockerId]) {
        const { data: pData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("id", lockerId)
          .maybeSingle();
        if (pData) setLockerNames((prev) => ({ ...prev, [pData.id]: pData.full_name }));
      }
    }
  };

  const mvp = useMemo(() => rows.filter((r) => r.feature_type === "mvp"), [rows]);
  const post = useMemo(() => rows.filter((r) => r.feature_type !== "mvp"), [rows]);

  if (loading) {
    return (
      <div>
        <div className="bg-gray-100 rounded h-4 w-24 mb-3 animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-gray-100 rounded-md h-10 mb-2 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-sm text-gray-500 py-4">
        <AlertCircle className="w-5 h-5 mx-auto mb-2 text-red-400" />
        <div>Features could not be loaded.</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500 py-6">
        <Layout className="w-8 h-8 mx-auto text-gray-300 mb-2" />
        <div>No features have been defined for this initiative yet.</div>
        <div className="text-xs mt-1">Features are added via the LBC form.</div>
      </div>
    );
  }

  const renderItems = (list: FeatureRowFull[]) =>
    list.map((r, i) => {
      const lockerName = r.pi_locked_by ? lockerNames[r.pi_locked_by] ?? null : null;
      return (
        <FeatureItem
          key={r.id}
          row={r}
          index={i}
          options={piOptions}
          canEdit={canEdit}
          isAdmin={isAdmin}
          lockerName={lockerName}
          onSave={(draft) => saveFeature(r.id, draft)}
          onToggleLock={() => toggleLock(r.id)}
        />
      );
    });

  return (
    <div>
      {mvp.length > 0 && (
        <section>
          <SectionHeader>MVP Features</SectionHeader>
          {renderItems(mvp)}
        </section>
      )}
      {mvp.length > 0 && post.length > 0 && <div className="border-t border-gray-100 my-4" />}
      {post.length > 0 && (
        <section>
          <SectionHeader>Post-MVP Features</SectionHeader>
          {renderItems(post)}
        </section>
      )}
    </div>
  );
}
