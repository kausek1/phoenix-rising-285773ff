import { supabase } from "@/integrations/supabase/client";

export type FlowStage = "review" | "analysis" | "ready" | "in_delivery";

export const FLOW_STAGES: { key: FlowStage; label: string }[] = [
  { key: "review", label: "Review" },
  { key: "analysis", label: "Analysis" },
  { key: "ready", label: "Ready" },
  { key: "in_delivery", label: "In Delivery" },
];

export const DEFAULT_THRESHOLDS: Record<FlowStage, { green_max_days: number; yellow_max_days: number }> = {
  review:      { green_max_days: 5,  yellow_max_days: 10 },
  analysis:    { green_max_days: 14, yellow_max_days: 21 },
  ready:       { green_max_days: 7,  yellow_max_days: 14 },
  in_delivery: { green_max_days: 30, yellow_max_days: 45 },
};

export interface ThresholdRow {
  stage: FlowStage;
  green_max_days: number;
  yellow_max_days: number;
}

export interface StageStat {
  stage: FlowStage;
  avgDaysCurrent: number | null;
  avgDaysRolling: number | null;
  sampleSizeCurrent: number;
  sampleSizeRolling: number;
}

interface TransitionRow {
  initiative_id: string;
  from_stage: string | null;
  to_stage: string | null;
  changed_at: string;
}

/**
 * Compute paired entry→exit durations per stage.
 * Window = [windowStart, windowEnd?] applied to the EXIT timestamp.
 */
function computeAvg(
  rows: TransitionRow[],
  stage: FlowStage,
  windowStart: Date,
  windowEnd?: Date,
): { avg: number | null; n: number } {
  const byInit = new Map<string, TransitionRow[]>();
  for (const r of rows) {
    if (!byInit.has(r.initiative_id)) byInit.set(r.initiative_id, []);
    byInit.get(r.initiative_id)!.push(r);
  }
  const durations: number[] = [];
  for (const list of byInit.values()) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
    );
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].to_stage !== stage) continue;
      const entryAt = new Date(sorted[i].changed_at);
      // find next exit
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].from_stage === stage) {
          const exitAt = new Date(sorted[j].changed_at);
          if (exitAt >= windowStart && (!windowEnd || exitAt <= windowEnd)) {
            const days = (exitAt.getTime() - entryAt.getTime()) / 86400000;
            if (days >= 0) durations.push(days);
          }
          break;
        }
      }
    }
  }
  if (durations.length === 0) return { avg: null, n: 0 };
  return {
    avg: durations.reduce((a, b) => a + b, 0) / durations.length,
    n: durations.length,
  };
}

export async function loadFlowHealth(
  clientId: string,
  piWindow: { start: Date; end: Date } | null,
  referenceDate?: Date,
): Promise<{ stats: Record<FlowStage, StageStat>; thresholds: Record<FlowStage, ThresholdRow> }> {
  const { data: txData } = await supabase
    .from("kanban_stage_transitions")
    .select("initiative_id, from_stage, to_stage, changed_at")
    .eq("client_id", clientId);

  const rows = (txData ?? []) as TransitionRow[];

  const now = referenceDate ?? new Date();
  const rollingStart = new Date(now.getTime() - 365 * 86400000);

  const stats = {} as Record<FlowStage, StageStat>;
  for (const { key } of FLOW_STAGES) {
    const rolling = computeAvg(rows, key, rollingStart, now);
    const current = piWindow
      ? computeAvg(rows, key, piWindow.start, piWindow.end)
      : { avg: null, n: 0 };
    stats[key] = {
      stage: key,
      avgDaysRolling: rolling.avg,
      sampleSizeRolling: rolling.n,
      avgDaysCurrent: current.avg,
      sampleSizeCurrent: current.n,
    };
  }

  const thresholds = { ...DEFAULT_THRESHOLDS } as Record<FlowStage, ThresholdRow>;
  // hydrate thresholds: cast to any so missing-table doesn't break TS
  const { data: thrData } = await (supabase as any)
    .from("portfolio_kanban_settings")
    .select("stage, green_max_days, yellow_max_days")
    .eq("client_id", clientId);
  for (const row of (thrData ?? []) as ThresholdRow[]) {
    if (FLOW_STAGES.some((s) => s.key === row.stage)) {
      thresholds[row.stage] = {
        stage: row.stage,
        green_max_days: Number(row.green_max_days),
        yellow_max_days: Number(row.yellow_max_days),
      };
    }
  }
  // always make sure every stage has an entry
  for (const { key } of FLOW_STAGES) {
    if (!thresholds[key]) thresholds[key] = { stage: key, ...DEFAULT_THRESHOLDS[key] };
  }
  return { stats, thresholds };
}

export type RYG = "green" | "yellow" | "red" | "none";

export function classifyRYG(avgDays: number | null, t: ThresholdRow | undefined): RYG {
  if (avgDays == null || !t) return "none";
  if (avgDays <= t.green_max_days) return "green";
  if (avgDays <= t.yellow_max_days) return "yellow";
  return "red";
}

export const RYG_COLOR: Record<Exclude<RYG, "none">, string> = {
  green: "#16A34A",
  yellow: "#D97706",
  red: "#DC2626",
};

export const RYG_LABEL: Record<Exclude<RYG, "none">, string> = {
  green: "On Track",
  yellow: "Watch",
  red: "Overdue",
};
