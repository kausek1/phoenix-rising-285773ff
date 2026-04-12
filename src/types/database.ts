export type UserRole = "admin" | "contributor" | "viewer";
export type InitiativeStage = "funnel" | "review" | "analysis" | "ready" | "in_delivery" | "deployed" | "closed" | "archive";
export type RiskLevel = "very_high" | "high" | "normal" | "low";
export type CorrelationStrength = "none" | "weak" | "medium" | "strong";
export type LBCDecision = "approved" | "pivot" | "deferred" | "not_approved";
export type FinancialMethod = "simple_payback" | "npv";
export type EmissionScope = "scope_1" | "scope_2" | "scope_3";

export interface Profile {
  id: string; client_id: string; full_name: string; email: string;
  role: UserRole; avatar_url?: string | null;
  created_at: string; updated_at: string;
}

export interface Client {
  id: string; name: string; created_at: string; updated_at: string;
}

export interface XMatrixGoal {
  id: string; client_id: string; title: string; description: string | null;
  target_year: number; status: string; created_at: string; updated_at: string;
}

export interface XMatrixObjective {
  id: string; client_id: string; title: string; description: string | null;
  fiscal_year: string; status: string; created_at: string; updated_at: string;
}

export interface XMatrixPriority {
  id: string; client_id: string; title: string; description: string | null;
  owner_id: string | null; status: string; created_at: string; updated_at: string;
}

export interface XMatrixKPI {
  id: string; client_id: string; name: string; description: string | null;
  unit: string; target_value: number | null; current_value: number | null;
  owner_id: string | null; created_at: string; updated_at: string;
}

export interface XMatrixOwner {
  id: string; client_id: string; name: string; role_title: string;
  profile_id: string | null; created_at: string; updated_at: string;
}

export interface Correlation {
  id: string; client_id: string; strength: CorrelationStrength;
  [key: string]: string | undefined;
}

export interface Initiative {
  id: string; client_id: string; title: string; description: string | null;
  stage: InitiativeStage; owner_name: string | null;
  business_roi: number | null; planet_impact: number | null;
  people_impact: number | null; strategic_alignment: number | null;
  time_to_deploy: number | null; risk_level: RiskLevel | null;
  risk_weight: number | null; wsjf_score: number | null;
  wsjf_score_raw: number | null;
  impacts_business: boolean; impacts_environmental: boolean; impacts_people: boolean;
  mvp_cost: number | null; estimated_deployment_cost: number | null;
  estimated_annual_opex: number | null; estimated_annual_savings: number | null;
  financial_method: FinancialMethod | null; simple_payback_years: number | null;
  npv: number | null; discount_rate: number | null;
  estimated_co2_reduction: number | null; funnel_entry_date: string | null;
  lbc_decision: LBCDecision | null; sprint_id: string | null;
  due_date: string | null; created_at: string; updated_at: string;
}

export interface LeanBusinessCase {
  id: string; client_id: string; initiative_id: string;
  lbc_number?: number | null;
  initiative_owner_name?: string | null;
  key_stakeholders: string | null; in_scope: string | null;
  out_of_scope: string | null; impact_outcome_hypothesis: string | null;
  leading_indicators: string | null; mvp_features: string | null;
  additional_features: string | null; estimated_mvp_months: number | null;
  estimated_deploy_months: number | null; sources_summary: string | null;
  customer_impact: string | null; strategic_alignments: string | null;
  value_chain_impact: string | null; development_strategy: string | null;
  sequencing_dependencies: string | null; risk_narrative: string | null;
  mvp_cost_narrative?: string | null;
  deployment_cost_narrative?: string | null;
  estimate_of_return_narrative?: string | null;
  attachments: string | null; other_notes: string | null;
  created_at: string; updated_at: string;
}

export interface LBCObjectiveAlignment {
  id: string; client_id: string; initiative_id: string;
  objective_id: string; strength: CorrelationStrength;
  created_at?: string; updated_at?: string;
}

export interface KanbanWipLimit {
  id: string; client_id: string; stage: InitiativeStage; wip_limit: number;
}

export interface KanbanStageTransition {
  id: string; client_id: string; initiative_id: string;
  from_stage: InitiativeStage; to_stage: InitiativeStage;
  changed_by: string; changed_at: string;
}

export interface Asset {
  id: string; client_id: string; name: string; asset_type: string;
  city: string | null; country: string | null;
  gross_floor_area_m2: number | null; year_built: number | null;
  certification: string | null; status: string | null;
  created_at: string; updated_at: string;
}

export interface EnergyConsumption {
  id: string; client_id: string; asset_id: string;
  fuel_type: string; period_start: string; period_end: string;
  quantity: number; unit: string; cost: number | null;
  created_at: string; updated_at: string;
}

export interface Emission {
  id: string; client_id: string; asset_id: string;
  scope: EmissionScope; scope_3_category: string | null;
  reporting_year: number; co2e_tonnes: number;
  emission_factor: number | null; source: string | null;
  verified: boolean; created_at: string; updated_at: string;
}

export interface ReductionTarget {
  id: string; client_id: string; scope: EmissionScope;
  baseline_year: number; baseline_co2e: number;
  target_year: number; target_reduction_pct: number;
  target_co2e: number | null; methodology: string | null;
  science_based: boolean; sbti_approved: boolean;
  created_at: string; updated_at: string;
}

export interface WSJFConfig {
  id: string; client_id: string; risk_level: RiskLevel; risk_weight: number;
  alignment_points?: Record<string, number>;
  alignment_cap?: number;
}

export interface Sprint {
  id: string; client_id: string; name: string;
  start_date: string; end_date: string;
}
