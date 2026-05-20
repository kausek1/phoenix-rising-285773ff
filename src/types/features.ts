export type FeatureType = "mvp" | "post_mvp";
export type FeatureStatus = "backlog" | "in_progress" | "done" | "cancelled";

export type FeatureRow = {
  id: string | null;
  feature_type: FeatureType;
  title: string;
  acceptance_criteria: string;
  status: FeatureStatus;
  sort_order: number;
  duration_months: number | null;
};

export function createBlankFeatureRow(
  feature_type: FeatureType,
  sort_order = 0,
): FeatureRow {
  return {
    id: null,
    feature_type,
    title: "",
    acceptance_criteria: "",
    status: "backlog",
    sort_order,
    duration_months: null,
  };
}
