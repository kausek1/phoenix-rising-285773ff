/**
 * Maps a numeric value to a Fibonacci score using threshold ranges.
 * Thresholds is a record keyed by Fibonacci score string, each with optional min/max.
 * Checks from highest to lowest: 13, 10, 8, 5, 3, 2, 1.
 */

const FIB_ORDER = [13, 10, 8, 5, 3, 2, 1] as const;

interface ThresholdRange {
  min?: string | number;
  max?: string | number;
}

type Thresholds = Record<string, ThresholdRange>;

export function mapToFibonacci(value: number | null | undefined, thresholds: Thresholds | null | undefined): number {
  if (value == null || value <= 0 || !thresholds) return 1;

  for (const fib of FIB_ORDER) {
    const range = thresholds[String(fib)];
    if (!range) continue;

    const min = range.min != null && range.min !== "" ? Number(range.min) : null;
    const max = range.max != null && range.max !== "" ? Number(range.max) : null;

    // Use exclusive lower bound (> min) and inclusive upper bound (<= max)
    // so boundary values like 24 fall into the lower band (12-24 → score 8, not 24-36 → score 10)
    const aboveMin = min === null || value > min;
    const belowMax = max === null || value <= max;

    if (aboveMin && belowMax) return fib;
  }

  return 1;
}

interface WSJFConfigForScoring {
  scoring_mode?: string | null;
  business_impact_criterion?: string | null;
  business_impact_thresholds?: Thresholds | null;
  payback_thresholds?: Thresholds | null;
  planet_impact_criterion?: string | null;
  planet_impact_thresholds?: Thresholds | null;
  pct_baseline_thresholds?: Thresholds | null;
  baseline_total_co2e?: number | null;
  duration_thresholds?: Thresholds | null;
}

interface InitiativeForScoring {
  estimated_annual_savings?: number | null;
  simple_payback_years?: number | null;
  estimated_co2_reduction?: number | null;
  estimated_deploy_months?: number | null;
}

export function computeAutoScores(
  config: WSJFConfigForScoring,
  initiative: InitiativeForScoring
): { business_roi: number; planet_impact: number; time_to_deploy: number } | null {
  console.log("═══ computeAutoScores CALLED ═══");
  console.log("[AutoScore] config.scoring_mode:", config.scoring_mode);
  console.log("[AutoScore] config.business_impact_criterion:", config.business_impact_criterion);
  console.log("[AutoScore] config.planet_impact_criterion:", config.planet_impact_criterion);
  console.log("[AutoScore] config.baseline_total_co2e:", config.baseline_total_co2e);
  console.log("[AutoScore] initiative input:", JSON.stringify(initiative));
  console.log("[AutoScore] payback_thresholds:", JSON.stringify(config.payback_thresholds));
  console.log("[AutoScore] pct_baseline_thresholds:", JSON.stringify(config.pct_baseline_thresholds));
  console.log("[AutoScore] duration_thresholds:", JSON.stringify(config.duration_thresholds));
  const mode = config.scoring_mode;
  if (mode !== "auto" && mode !== "hybrid") {
    console.log("[AutoScore] RETURNING null — mode is:", mode);
    return null;
  }

  // Business Impact
  let business_roi = 1;
  if (config.business_impact_criterion === "payback_period") {
    business_roi = mapToFibonacci(initiative.simple_payback_years, config.payback_thresholds);
  } else {
    // default to annual_savings
    business_roi = mapToFibonacci(initiative.estimated_annual_savings, config.business_impact_thresholds);
  }

  // Planet Impact
  let planet_impact = 1;
  if (config.planet_impact_criterion === "pct_baseline" && config.baseline_total_co2e) {
    const pct = initiative.estimated_co2_reduction != null
      ? (initiative.estimated_co2_reduction / config.baseline_total_co2e) * 100
      : null;
    planet_impact = mapToFibonacci(pct, config.pct_baseline_thresholds);
  } else {
    // absolute_co2e or fallback when baseline missing
    planet_impact = mapToFibonacci(initiative.estimated_co2_reduction, config.planet_impact_thresholds);
  }

  // Duration
  const time_to_deploy = mapToFibonacci(initiative.estimated_deploy_months, config.duration_thresholds);

  console.log("[AutoScore] RESULT:", { business_roi, planet_impact, time_to_deploy });
  console.log("═══ computeAutoScores END ═══");
  return { business_roi, planet_impact, time_to_deploy };
}
