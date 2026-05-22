import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface SeqRow {
  id: string;
  item_type: "feature" | "milestone" | "gate";
  feature_id: string | null;
  label: string | null;
  month_start: number;
  notes: string | null;
}

interface FeatureRow {
  id: string;
  title: string;
  feature_type: "mvp" | "post_mvp";
  duration_months: number | null;
  status: "backlog" | "in_progress" | "done" | "cancelled";
  planned_pi_id: string | null;
  pi_start_date: string | null;
  pi_end_date: string | null;
}

const MONTH_W = 44;
const LABEL_W = 210;
const ROW_H = 32;

const STATUS_COLOR: Record<string, string> = {
  done: "#0E7A65",
  in_progress: "#F59E0B",
  backlog: "#94A3B8",
  cancelled: "#94A3B8",
};

export default function RoadmapTab({
  initiativeId,
  onGoToSequencing,
}: {
  initiativeId: string;
  onGoToSequencing: () => void;
}) {
  const { clientId } = useAuth();
  const [seq, setSeq] = useState<SeqRow[]>([]);
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [deployMonths, setDeployMonths] = useState<number>(12);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId || !initiativeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: seqData }, { data: feats }, { data: init }] = await Promise.all([
        supabase
          .from("initiative_sequencing")
          .select("id, item_type, feature_id, label, month_start, notes")
          .eq("client_id", clientId)
          .eq("initiative_id", initiativeId),
        supabase
          .from("features")
          .select(
            "id, title, feature_type, duration_months, status, planned_pi_id, planning_increments:planned_pi_id(start_date, end_date)",
          )
          .eq("client_id", clientId)
          .eq("initiative_id", initiativeId)
          .order("sort_order"),
        supabase
          .from("initiatives")
          .select("estimated_deploy_months")
          .eq("id", initiativeId)
          .single(),
      ]);
      if (cancelled) return;
      setSeq((seqData as SeqRow[]) ?? []);
      setFeatures(
        ((feats as any[]) ?? []).map((f) => ({
          id: f.id,
          title: f.title,
          feature_type: f.feature_type,
          duration_months: f.duration_months ?? null,
          status: f.status,
          planned_pi_id: f.planned_pi_id ?? null,
          pi_start_date: f.planning_increments?.start_date ?? null,
          pi_end_date: f.planning_increments?.end_date ?? null,
        })),
      );
      setDeployMonths((init as any)?.estimated_deploy_months ?? 12);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, initiativeId]);

  const totalMonths = Math.max(6, deployMonths + 2);

  // Earliest PI start across this initiative's features
  const initiativeStart = useMemo(() => {
    const dates = features
      .filter((f) => f.pi_start_date)
      .map((f) => new Date(f.pi_start_date!).getTime());
    if (dates.length === 0) return null;
    return new Date(Math.min(...dates));
  }, [features]);

  const seqByFeatureId = useMemo(() => {
    const m = new Map<string, SeqRow>();
    seq.forEach((s) => {
      if (s.item_type === "feature" && s.feature_id) m.set(s.feature_id, s);
    });
    return m;
  }, [seq]);

  const milestones = seq.filter((s) => s.item_type === "milestone");
  const gates = seq.filter((s) => s.item_type === "gate");

  const mvpFeatures = features.filter((f) => f.feature_type === "mvp");
  const postMvpFeatures = features.filter((f) => f.feature_type === "post_mvp");

  const anyActuals = features.some((f) => f.planned_pi_id);

  const computeActualMonth = (f: FeatureRow): number | null => {
    if (!f.pi_start_date || !initiativeStart) return null;
    const piStart = new Date(f.pi_start_date).getTime();
    const diffDays = (piStart - initiativeStart.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(1, Math.ceil(diffDays / 30.44) + 1);
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  if (seq.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-6 text-center space-y-3">
        <div className="text-sm text-slate-600">
          No sequencing data yet.
          <br />
          Use the Sequencing tab to build the planned timeline.
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onGoToSequencing}
          className="border-teal-600 text-teal-700 hover:bg-teal-50"
        >
          Go to Sequencing
        </Button>
      </div>
    );
  }

  const chartWidth = totalMonths * MONTH_W;

  const renderSwimlane = (title: string, rows: FeatureRow[]) => (
    <div>
      <div
        className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-700 border-y border-slate-200"
        style={{ width: LABEL_W + chartWidth }}
      >
        {title}
      </div>
      {rows.length === 0 && (
        <div
          className="px-2 py-2 text-xs text-muted-foreground"
          style={{ width: LABEL_W + chartWidth }}
        >
          No features.
        </div>
      )}
      {rows.map((f) => {
        const seqRow = seqByFeatureId.get(f.id);
        const dur = Math.max(1, f.duration_months ?? 1);
        const actualMonth = computeActualMonth(f);
        const statusColor = STATUS_COLOR[f.status] ?? "#94A3B8";
        return (
          <div
            key={f.id}
            className="flex items-stretch border-b border-slate-100"
            style={{ height: ROW_H }}
          >
            <div
              className="px-2 py-1 text-xs text-slate-700 border-r border-slate-200 flex items-center"
              style={{ width: LABEL_W, minWidth: LABEL_W }}
              title={f.title}
            >
              <span className="truncate">{f.title}</span>
            </div>
            <div className="relative" style={{ width: chartWidth }}>
              {/* month grid */}
              {Array.from({ length: totalMonths }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-r border-slate-100"
                  style={{ left: i * MONTH_W, width: MONTH_W }}
                />
              ))}
              {/* Baseline */}
              {seqRow && (
                <div
                  className="absolute"
                  style={{
                    left: (seqRow.month_start - 1) * MONTH_W,
                    width: dur * MONTH_W,
                    top: 4,
                    height: 10,
                    backgroundColor: "#2E6FA5",
                    opacity: 0.35,
                    borderRadius: 2,
                  }}
                  title={`Planned: M${seqRow.month_start} • ${dur} month(s)`}
                />
              )}
              {/* Actual */}
              {f.planned_pi_id && actualMonth != null && (
                <div
                  className="absolute"
                  style={{
                    left: (actualMonth - 1) * MONTH_W,
                    width: dur * MONTH_W,
                    top: ROW_H / 2 - 4,
                    height: 20,
                    backgroundColor: statusColor,
                    borderRadius: 3,
                  }}
                  title={`Actual (${f.status}): M${actualMonth} • ${dur} month(s)`}
                />
              )}
              {/* Gates as vertical dashed lines */}
              {gates.map((g) => (
                <div
                  key={g.id}
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{
                    left: (g.month_start - 1) * MONTH_W,
                    width: 0,
                    borderLeft: "2px dashed #DC2626",
                  }}
                  title={g.label ?? "Gate"}
                />
              ))}
              {/* Milestones as stars */}
              {milestones.map((m) => (
                <div
                  key={m.id}
                  className="absolute top-0 bottom-0 pointer-events-none flex items-center justify-center"
                  style={{
                    left: (m.month_start - 1) * MONTH_W,
                    width: MONTH_W,
                  }}
                  title={m.label ?? "Milestone"}
                >
                  <span style={{ color: "#F59E0B", fontSize: 14 }}>★</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <span className="flex items-center gap-1">
          <span
            className="inline-block"
            style={{ width: 14, height: 6, backgroundColor: "#2E6FA5", opacity: 0.35 }}
          />
          Planned (Box 21 baseline)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block" style={{ width: 14, height: 10, backgroundColor: "#0E7A65" }} />
          Actual — Done
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block" style={{ width: 14, height: 10, backgroundColor: "#F59E0B" }} />
          Actual — In Progress
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block" style={{ width: 14, height: 10, backgroundColor: "#94A3B8" }} />
          Actual — Not yet scheduled
        </span>
        <span style={{ color: "#F59E0B" }}>★ Milestone</span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block"
            style={{ width: 14, height: 0, borderTop: "2px dashed #DC2626" }}
          />
          Decision Gate
        </span>
      </div>

      {!anyActuals && (
        <div className="text-[11px] text-muted-foreground italic">
          No PI assignments yet — showing baseline only.
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-md">
        <div style={{ width: LABEL_W + chartWidth }}>
          {/* Header row */}
          <div className="flex bg-slate-50 border-b border-slate-200">
            <div
              className="px-2 py-1 text-[11px] font-semibold text-slate-600 border-r border-slate-200"
              style={{ width: LABEL_W, minWidth: LABEL_W }}
            >
              Feature
            </div>
            <div className="flex" style={{ width: chartWidth }}>
              {Array.from({ length: totalMonths }).map((_, i) => (
                <div
                  key={i}
                  className="text-center text-[10px] text-slate-500 border-r border-slate-100 py-1"
                  style={{ width: MONTH_W, minWidth: MONTH_W }}
                >
                  M{i + 1}
                </div>
              ))}
            </div>
          </div>

          {renderSwimlane("MVP Phase", mvpFeatures)}
          {renderSwimlane("Post-MVP Phase", postMvpFeatures)}
        </div>
      </div>
    </div>
  );
}
