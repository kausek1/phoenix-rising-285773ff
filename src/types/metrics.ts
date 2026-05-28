export type MetricDirection = "reduction" | "accumulation";

export type OutcomeHypothesisRow = {
  id?: string;
  metric_category: string;
  metric_name: string;
  description: string;
  baseline_value: number | null;
  baseline_unit: string;
  target_value: number | null;
  target_unit: string;
  metric_direction: MetricDirection;
  measurement_timing: string;
  measurement_method: string;
  confidence_level: string;
  linked_xmatrix_kpi_id: string | null;
  is_key_result: boolean;
  notes: string;
  sort_order: number;
};

export type LeadingIndicatorRow = {
  id?: string;
  metric_category: string;
  metric_name: string;
  description: string;
  target_value: number | null;
  target_unit: string;
  measurement_timing: string;
  // 'post_mvp' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  update_frequency: string;
  alert_threshold_pct: number;
  notes: string;
  sort_order: number;
};

export function createBlankOutcomeHypothesisRow(sortOrder: number): OutcomeHypothesisRow {
  return {
    metric_category: "",
    metric_name: "",
    description: "",
    baseline_value: null,
    baseline_unit: "",
    target_value: null,
    target_unit: "",
    metric_direction: "reduction",
    measurement_timing: "",
    measurement_method: "",
    confidence_level: "",
    linked_xmatrix_kpi_id: null,
    is_key_result: false,
    notes: "",
    sort_order: sortOrder,
  };
}

export function createBlankLeadingIndicatorRow(sortOrder: number): LeadingIndicatorRow {
  return {
    metric_category: "",
    metric_name: "",
    description: "",
    target_value: null,
    target_unit: "",
    measurement_timing: "",
    update_frequency: "",
    alert_threshold_pct: 15,
    notes: "",
    sort_order: sortOrder,
  };
}
