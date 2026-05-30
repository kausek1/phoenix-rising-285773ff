import { supabase } from "@/integrations/supabase/client";
import { addMonths, format } from "date-fns";

/**
 * Computed delivery-date estimates for an initiative, derived from its
 * feature rows (Boxes 10 & 11 of the LBC form).
 *
 * Anchor = month of the most recent kanban_stage_transitions.changed_at for
 * the initiative (i.e. when it entered its current stage). If no transition
 * exists, falls back to the supplied reference date.
 *
 *  MVP est.  = anchor + Σ duration_months WHERE is_mvp = true AND status != 'done'
 *  Full est. = anchor + Σ duration_months WHERE status != 'done'
 *
 * If all MVP features are done, mvpLabel = "MVP delivered".
 */
export interface InitiativeEstimate {
  mvpLabel: string | null;
  fullLabel: string | null;
  mvpDelivered: boolean;
}

interface FeatureRow {
  initiative_id: string;
  is_mvp: boolean | null;
  status: string | null;
  sort_order: number | null;
  duration_months: number | null;
}

interface TransitionRow {
  initiative_id: string;
  changed_at: string;
}

export async function fetchInitiativeEstimates(
  initiativeIds: string[],
  referenceDate: Date,
): Promise<Record<string, InitiativeEstimate>> {
  if (initiativeIds.length === 0) return {};

  const [featuresRes, transitionsRes] = await Promise.all([
    supabase
      .from("features")
      .select("initiative_id, is_mvp, status, sort_order, duration_months")
      .in("initiative_id", initiativeIds),
    supabase
      .from("kanban_stage_transitions")
      .select("initiative_id, changed_at")
      .in("initiative_id", initiativeIds)
      .order("changed_at", { ascending: false }),
  ]);

  const anchorMap = new Map<string, Date>();
  for (const t of (transitionsRes.data as TransitionRow[] | null) ?? []) {
    if (!anchorMap.has(t.initiative_id)) {
      anchorMap.set(t.initiative_id, new Date(t.changed_at));
    }
  }

  const byInit = new Map<string, FeatureRow[]>();
  for (const f of (featuresRes.data as FeatureRow[] | null) ?? []) {
    const arr = byInit.get(f.initiative_id) ?? [];
    arr.push(f);
    byInit.set(f.initiative_id, arr);
  }

  const out: Record<string, InitiativeEstimate> = {};
  const sumMonths = (rows: FeatureRow[]) =>
    rows.reduce((s, r) => s + (Number(r.duration_months) || 0), 0);

  for (const id of initiativeIds) {
    const feats = (byInit.get(id) ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const mvpAll = feats.filter((f) => f.is_mvp === true);
    const mvpRemaining = mvpAll.filter((f) => f.status !== "done");
    const allRemaining = feats.filter((f) => f.status !== "done");
    const anchor = anchorMap.get(id) ?? referenceDate;

    const mvpDelivered = mvpAll.length > 0 && mvpRemaining.length === 0;
    const mvpLabel =
      mvpAll.length === 0
        ? null
        : mvpDelivered
          ? "MVP delivered"
          : `MVP est. ${format(addMonths(anchor, sumMonths(mvpRemaining)), "MMM yyyy")}`;
    const fullLabel =
      feats.length === 0
        ? null
        : allRemaining.length === 0
          ? "Full delivered"
          : `Full est. ${format(addMonths(anchor, sumMonths(allRemaining)), "MMM yyyy")}`;

    out[id] = { mvpLabel, fullLabel, mvpDelivered };
  }
  return out;
}
