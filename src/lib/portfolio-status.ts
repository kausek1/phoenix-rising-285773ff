import { supabase } from "@/integrations/supabase/client";

export type RAG = "green" | "yellow" | "red" | "grey";

export interface InitiativeStatus {
  initiative_id: string;
  schedule: { rag: RAG; label: string };
  cost: { rag: RAG; label: string; warn?: string; tooltip?: string };
  impact: { rag: RAG; label: string };
  last_updated: string | null;
}

export interface PI {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

interface FeatureRow {
  id: string;
  initiative_id: string;
  status: string;
  feature_type: string;
  planned_pi_id: string | null;
}

async function loadPIs(clientId: string): Promise<Map<string, PI>> {
  const { data } = await supabase
    .from("planning_increments")
    .select("id, name, start_date, end_date")
    .eq("client_id", clientId);
  const m = new Map<string, PI>();
  for (const p of (data ?? []) as PI[]) m.set(p.id, p);
  return m;
}

function piPassed(pi: PI | undefined, now: Date): boolean {
  if (!pi?.end_date) return false;
  return new Date(pi.end_date) < now;
}

function computeSchedule(
  features: FeatureRow[],
  pis: Map<string, PI>,
  now: Date,
): { rag: RAG; label: string } {
  const planned = features.filter((f) => f.planned_pi_id);
  if (planned.length === 0) return { rag: "grey", label: "Schedule TBD" };

  let lateMvp = false;
  let lateActive = 0;
  let lateNotDone = 0;
  for (const f of planned) {
    const pi = pis.get(f.planned_pi_id!);
    if (!piPassed(pi, now)) continue;
    if (f.status === "done") continue;
    lateNotDone++;
    if (f.status !== "cancelled" && f.status !== "backlog") lateActive++;
    if (f.feature_type === "mvp") lateMvp = true;
  }
  if (lateNotDone === 0) return { rag: "green", label: "On Track" };
  if (lateMvp || lateNotDone >= 2) return { rag: "red", label: "Off Track" };
  if (lateActive === 1) return { rag: "yellow", label: "At Risk" };
  return { rag: "red", label: "Off Track" };
}

interface BudgetRow {
  initiative_id: string;
  approved_budget_mvp: number | null;
  approved_budget_full: number | null;
}

interface SpendRow {
  initiative_id: string;
  spend_amount: number | null;
}

function computeCost(
  initiativeId: string,
  budgets: Map<string, BudgetRow>,
  spends: Map<string, number>,
  fallbackMvp: number | null,
): { rag: RAG; label: string; warn?: string; tooltip?: string } {
  const b = budgets.get(initiativeId);
  const overrideMvp = b?.approved_budget_mvp ?? null;
  const budget = overrideMvp ?? fallbackMvp ?? null;
  const source: "override" | "lbc" | null =
    overrideMvp != null ? "override" : fallbackMvp != null ? "lbc" : null;
  const actual = spends.get(initiativeId) ?? 0;

  if (budget == null) return { rag: "grey", label: "Cost TBD" };

  const sourceLabel = source === "override" ? "Approved override" : "LBC estimate";
  const tooltip = `Budget: ${fmtCurrency(budget)} (${sourceLabel}) · Actual: ${fmtCurrency(actual)}`;

  if (actual <= budget) return { rag: "green", label: "On Track", tooltip };
  if (actual <= budget * 1.1) return { rag: "yellow", label: "At Risk", tooltip };
  return { rag: "red", label: "Off Track", tooltip };
}

interface ImpactReadingRow {
  status_rag: string | null;
  initiative_metrics: { initiative_id: string } | null;
}
interface LastReadingRow {
  reading_date: string;
  initiative_metrics: { initiative_id: string } | null;
}

function computeImpact(statuses: string[] | undefined): { rag: RAG; label: string } {
  if (!statuses?.length) return { rag: "grey", label: "No readings" };
  if (statuses.includes("off_track")) return { rag: "red", label: "Off Track" };
  if (statuses.includes("at_risk")) return { rag: "yellow", label: "At Risk" };
  if (statuses.every((s) => s === "on_track")) return { rag: "green", label: "On Track" };
  return { rag: "grey", label: "No readings" };
}

export function fmtCurrency(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export interface InitiativeRow {
  id: string;
  title: string;
  stage: string;
  wsjf_score: number | null;
  mvp_cost: number | null;
  updated_at: string | null;
}

export async function loadInitiativeDeliveryStatus(clientId: string, referenceDate?: Date): Promise<{
  initiatives: InitiativeRow[];
  lbcNumbers: Record<string, number>;
  statuses: Record<string, InitiativeStatus>;
}> {
  const now = referenceDate ?? new Date();
  const { data: initData } = await supabase
    .from("initiatives")
    .select("id, title, stage, wsjf_score, mvp_cost, updated_at")
    .eq("client_id", clientId)
    .eq("initiative_type", "lbc")
    .in("stage", ["in_delivery", "deployed"])
    .order("wsjf_score", { ascending: false });

  const initiatives = (initData ?? []) as InitiativeRow[];
  const ids = initiatives.map((i) => i.id);
  if (ids.length === 0) return { initiatives, lbcNumbers: {}, statuses: {} };

  const [pis, lbcRes, featRes, budgetRes, spendRes, impactRes, lastReadingRes] = await Promise.all([
    loadPIs(clientId),
    supabase.from("lean_business_cases").select("initiative_id, lbc_number").in("initiative_id", ids),
    (supabase as any).from("features").select("id, initiative_id, status, feature_type, planned_pi_id").in("initiative_id", ids),
    supabase
      .from("initiative_budget_settings")
      .select("initiative_id, approved_budget_mvp, approved_budget_full")
      .eq("client_id", clientId)
      .in("initiative_id", ids),
    supabase
      .from("initiative_actual_spend")
      .select("initiative_id, spend_amount")
      .eq("client_id", clientId)
      .in("initiative_id", ids),
    supabase
      .from("metric_readings")
      .select("status_rag, initiative_metrics!inner(initiative_id, metric_type)")
      .eq("initiative_metrics.metric_type", "outcome_hypothesis"),
    supabase
      .from("metric_readings")
      .select("reading_date, initiative_metrics!inner(initiative_id)"),
  ]);

  const lbcNumbers: Record<string, number> = {};
  for (const r of (lbcRes.data ?? []) as { initiative_id: string; lbc_number: number | null }[]) {
    if (r.lbc_number) lbcNumbers[r.initiative_id] = r.lbc_number;
  }

  const features = (featRes.data ?? []) as FeatureRow[];


  const budgets = new Map<string, BudgetRow>();
  for (const b of (budgetRes.data ?? []) as BudgetRow[]) budgets.set(b.initiative_id, b);

  const spends = new Map<string, number>();
  for (const s of (spendRes.data ?? []) as SpendRow[]) {
    spends.set(s.initiative_id, (spends.get(s.initiative_id) ?? 0) + Number(s.spend_amount ?? 0));
  }

  const impactByInit = new Map<string, string[]>();
  for (const r of (impactRes.data ?? []) as unknown as ImpactReadingRow[]) {
    const initiativeId = r.initiative_metrics?.initiative_id;
    if (!initiativeId || !r.status_rag) continue;
    const statuses = impactByInit.get(initiativeId) ?? [];
    statuses.push(r.status_rag);
    impactByInit.set(initiativeId, statuses);
  }

  const latestByInit = new Map<string, string>();
  for (const r of (lastReadingRes.data ?? []) as unknown as LastReadingRow[]) {
    const initiativeId = r.initiative_metrics?.initiative_id;
    if (!initiativeId || !r.reading_date) continue;
    const existing = latestByInit.get(initiativeId);
    if (!existing || r.reading_date > existing) latestByInit.set(initiativeId, r.reading_date);
  }

  const statuses: Record<string, InitiativeStatus> = {};
  for (const init of initiatives) {
    const initFeatures = features.filter((f) => f.initiative_id === init.id);
    statuses[init.id] = {
      initiative_id: init.id,
      schedule: computeSchedule(initFeatures, pis, now),
      cost: computeCost(init.id, budgets, spends, init.mvp_cost),
      impact: computeImpact(impactByInit.get(init.id)),
      last_updated: latestByInit.get(init.id) ?? null,
    };
  }

  return { initiatives, lbcNumbers, statuses };
}

export const RAG_BG: Record<RAG, string> = {
  green: "#16A34A",
  yellow: "#D97706",
  red: "#DC2626",
  grey: "#6B7280",
};

export function fmtPiOption(pi: PI): string {
  if (!pi.start_date || !pi.end_date) return pi.name;
  const s = new Date(pi.start_date);
  const e = new Date(pi.end_date);
  const sm = s.toLocaleDateString("en-US", { month: "short" });
  const em = e.toLocaleDateString("en-US", { month: "short" });
  return `${pi.name} (${sm}–${em})`;
}

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtRelativeOrDate(d: string | null, now: Date = new Date()): string {
  if (!d) return "—";
  const then = new Date(d);
  const diffMs = now.getTime() - then.getTime();
  const day = 86400000;
  const days = Math.floor(diffMs / day);
  if (days < 0) return fmtDate(d);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w}w ago`;
  }
  return then.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
