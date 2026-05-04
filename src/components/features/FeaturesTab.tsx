import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckSquare, Layout, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { FeatureRow, FeatureStatus } from "@/types/features";
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

interface KbfRow {
  id?: string;
  feature_id: string;
  client_id: string;
  initiative_id: string;
  is_mvp: boolean | null;
  planned_pi_id: string | null;
  pi_locked: boolean | null;
  pi_locked_by: string | null;
  pi_locked_at: string | null;
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

function FeatureItem({
  row,
  index,
  kbf,
  pis,
  canEdit,
  isAdmin,
  lockerName,
  onUpdate,
}: {
  row: FeatureRow;
  index: number;
  kbf: KbfRow | undefined;
  pis: PI[];
  canEdit: boolean;
  isAdmin: boolean;
  lockerName: string | null;
  onUpdate: (patch: Partial<KbfRow>) => Promise<void>;
}) {
  const ac = (row.acceptance_criteria || "").trim();
  const isMvp = !!kbf?.is_mvp;
  const plannedPiId = kbf?.planned_pi_id ?? null;
  const locked = !!kbf?.pi_locked;
  const plannedPi = pis.find((p) => p.id === plannedPiId);

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
                checked={isMvp}
                disabled={!canEdit}
                onCheckedChange={(v) => onUpdate({ is_mvp: !!v })}
              />
              MVP Feature
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Planned PI:</span>
              {locked ? (
                <span
                  className="text-xs text-slate-700 inline-flex items-center gap-1"
                  title={
                    lockerName && kbf?.pi_locked_at
                      ? `Locked by ${lockerName} on ${fmtDate(kbf.pi_locked_at)}. Contact a Portfolio Admin to change.`
                      : "Locked. Contact a Portfolio Admin to change."
                  }
                >
                  <Lock className="h-3 w-3 text-slate-500" />
                  {plannedPi ? fmtPiOption(plannedPi) : "—"}
                </span>
              ) : (
                <Select
                  disabled={!canEdit}
                  value={plannedPiId ?? "__none__"}
                  onValueChange={(v) => onUpdate({ planned_pi_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger className="h-7 text-xs w-[180px]">
                    <SelectValue placeholder="Select PI" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {pis.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {fmtPiOption(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isAdmin && plannedPiId && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  title={locked ? "Unlock PI" : "Lock PI"}
                  onClick={() => onUpdate({ pi_locked: !locked })}
                >
                  {locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                </Button>
              )}
            </div>
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

  const [rows, setRows] = useState<FeatureRow[]>([]);
  const [kbfMap, setKbfMap] = useState<Record<string, KbfRow>>({});
  const [pis, setPis] = useState<PI[]>([]);
  const [lockerNames, setLockerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      const [{ data: featData, error: fErr }, { data: piData }] = await Promise.all([
        supabase
          .from("features")
          .select("id, feature_type, title, acceptance_criteria, status, sort_order")
          .eq("initiative_id", initiativeId)
          .eq("client_id", clientId)
          .order("feature_type", { ascending: true })
          .order("sort_order", { ascending: true }),
        supabase
          .from("planning_increments")
          .select("id, name, start_date, end_date")
          .eq("client_id", clientId)
          .order("start_date", { ascending: true }),
      ]);

      if (cancelled) return;
      if (fErr) {
        setError(true);
        setRows([]);
        setLoading(false);
        return;
      }
      const features = (featData as FeatureRow[]) || [];
      setRows(features);
      setPis((piData as PI[]) || []);

      const featureIds = features.map((f) => f.id).filter(Boolean) as string[];
      if (featureIds.length > 0) {
        const { data: kbfData } = await (supabase as any)
          .from("kanban_board_features")
          .select("id, feature_id, client_id, initiative_id, is_mvp, planned_pi_id, pi_locked, pi_locked_by, pi_locked_at")
          .in("feature_id", featureIds);
        const map: Record<string, KbfRow> = {};
        const lockerIds = new Set<string>();
        for (const k of (kbfData ?? []) as KbfRow[]) {
          map[k.feature_id] = k;
          if (k.pi_locked && k.pi_locked_by) lockerIds.add(k.pi_locked_by);
        }
        if (!cancelled) setKbfMap(map);

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
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initiativeId, clientId]);

  const updateKbf = async (featureId: string, patch: Partial<KbfRow>) => {
    const existing = kbfMap[featureId];
    const now = new Date().toISOString();
    const userId = profile?.id ?? null;

    // Lock metadata bookkeeping
    let extra: Partial<KbfRow> = {};
    if (Object.prototype.hasOwnProperty.call(patch, "pi_locked")) {
      if (patch.pi_locked) {
        extra = { pi_locked_by: userId, pi_locked_at: now };
      } else {
        extra = { pi_locked_by: null, pi_locked_at: null };
      }
    }

    const merged: KbfRow = {
      id: existing?.id,
      feature_id: featureId,
      client_id: clientId,
      initiative_id: initiativeId,
      is_mvp: existing?.is_mvp ?? false,
      planned_pi_id: existing?.planned_pi_id ?? null,
      pi_locked: existing?.pi_locked ?? false,
      pi_locked_by: existing?.pi_locked_by ?? null,
      pi_locked_at: existing?.pi_locked_at ?? null,
      ...patch,
      ...extra,
    };

    // First-time saving planned_pi_id → ensure pi_locked stays false (editable)
    if (Object.prototype.hasOwnProperty.call(patch, "planned_pi_id") && !existing?.planned_pi_id) {
      merged.pi_locked = false;
    }

    setKbfMap((prev) => ({ ...prev, [featureId]: merged }));

    const payload: any = {
      feature_id: featureId,
      client_id: clientId,
      initiative_id: initiativeId,
      is_mvp: merged.is_mvp,
      planned_pi_id: merged.planned_pi_id,
      pi_locked: merged.pi_locked,
      pi_locked_by: merged.pi_locked_by,
      pi_locked_at: merged.pi_locked_at,
    };
    if (existing?.id) payload.id = existing.id;

    const { data, error } = await (supabase as any)
      .from("kanban_board_features")
      .upsert(payload, { onConflict: "feature_id" })
      .select("id, feature_id, client_id, initiative_id, is_mvp, planned_pi_id, pi_locked, pi_locked_by, pi_locked_at")
      .single();

    if (error) {
      toast.error(`Failed to save: ${error.message}`);
      return;
    }
    if (data) setKbfMap((prev) => ({ ...prev, [featureId]: data as KbfRow }));
  };

  const mvp = useMemo(() => rows.filter((r) => r.feature_type === "mvp"), [rows]);
  const post = useMemo(() => rows.filter((r) => r.feature_type === "post_mvp"), [rows]);

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

  const renderItems = (list: FeatureRow[]) =>
    list.map((r, i) => {
      const kbf = r.id ? kbfMap[r.id] : undefined;
      const lockerName = kbf?.pi_locked_by ? lockerNames[kbf.pi_locked_by] ?? null : null;
      return (
        <FeatureItem
          key={r.id ?? `f-${i}`}
          row={r}
          index={i}
          kbf={kbf}
          pis={pis}
          canEdit={canEdit}
          isAdmin={isAdmin}
          lockerName={lockerName}
          onUpdate={(patch) => (r.id ? updateKbf(r.id, patch) : Promise.resolve())}
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
