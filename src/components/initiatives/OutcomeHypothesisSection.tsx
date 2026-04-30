import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  type OutcomeHypothesisRow,
  createBlankOutcomeHypothesisRow,
} from "@/types/metrics";

interface Props {
  initiativeId: string | null;
  priorityId: string | null;
  clientId: string;
  rows: OutcomeHypothesisRow[];
  onChange: (rows: OutcomeHypothesisRow[]) => void;
}

const CATEGORY_OPTIONS: Array<[string, string]> = [
  ["energy", "Energy"],
  ["carbon", "Carbon / GHG Emissions"],
  ["water", "Water"],
  ["waste", "Waste"],
  ["materials", "Materials & Supply Chain"],
  ["transport", "Transport"],
  ["biodiversity", "Biodiversity"],
  ["health", "Health & Wellbeing"],
  ["social", "Social Impact"],
  ["governance", "Governance"],
  ["cost", "Cost Savings"],
  ["revenue", "Revenue"],
  ["risk", "Risk Reduction"],
  ["process", "Process / Execution"],
];

const METHOD_GROUPS: Array<{ label: string; key: string; items: Array<[string, string]> }> = [
  {
    label: "IPMVP",
    key: "ipmvp",
    items: [
      ["IPMVP_A", "Option A — Partially Measured"],
      ["IPMVP_B", "Option B — Fully Measured"],
      ["IPMVP_C", "Option C — Whole Facility"],
      ["IPMVP_D", "Option D — Calibrated Simulation"],
    ],
  },
  {
    label: "GHG Protocol",
    key: "ghg",
    items: [
      ["GHG_market_based", "Market-Based (Scope 2)"],
      ["GHG_location_based", "Location-Based (Scope 2)"],
      ["GHG_spend_based", "Spend-Based (Scope 3)"],
      ["GHG_average_data", "Average Data (Scope 3)"],
      ["GHG_activity_based", "Activity-Based"],
    ],
  },
  {
    label: "General",
    key: "general",
    items: [
      ["direct_metering", "Direct Metering"],
      ["billing_analysis", "Utility Bill Analysis"],
      ["IoT_automated", "IoT / Automated Sensor"],
      ["engineering_estimate", "Engineering Estimate"],
      ["stipulated", "Stipulated Savings"],
      ["survey_self_reported", "Survey / Self-Reported"],
      ["third_party_audit", "Third-Party Audit"],
      ["hybrid", "Hybrid (describe in notes)"],
      ["other", "Other (describe in notes)"],
    ],
  },
];

const METHOD_LABEL_MAP: Record<string, string> = METHOD_GROUPS.flatMap((g) => g.items).reduce(
  (acc, [v, l]) => {
    acc[v] = l;
    return acc;
  },
  {} as Record<string, string>,
);

const CONFIDENCE_OPTIONS: Array<[string, string]> = [
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
  ["assumption", "Assumption"],
];

export default function OutcomeHypothesisSection({ rows, onChange }: Props) {
  const updateRow = (i: number, field: keyof OutcomeHypothesisRow, value: any) => {
    const updated = rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r));
    onChange(updated);
  };

  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next.map((r, idx) => ({ ...r, sort_order: idx })));
  };

  const deleteRow = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, sort_order: idx }));
    onChange(next);
  };

  return (
    <div>
      <h3 className="text-base font-semibold text-[#1B4F72] mb-1">
        Impact Outcome Hypotheses
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        What will success look like when this initiative is complete? Define the
        measurable result you are claiming this investment will deliver. This is
        your hypothesis — it will be tested and verified at the Commissioned and
        Verified stages.
      </p>

      {rows.map((row, i) => {
        const isFirst = i === 0;
        const isLast = i === rows.length - 1;
        const onlyOne = rows.length === 1;

        const unitsMismatch =
          !!row.baseline_unit &&
          !!row.target_unit &&
          row.baseline_unit.trim() !== row.target_unit.trim();

        const showReduction =
          row.baseline_value !== null &&
          row.target_value !== null &&
          row.baseline_value !== 0;
        const reductionPct = showReduction
          ? ((row.baseline_value! - row.target_value!) / row.baseline_value!) * 100
          : 0;

        const showPreview =
          !!row.metric_name &&
          row.target_value !== null &&
          !!row.target_unit &&
          !!row.target_date;

        let previewSentence = "";
        if (showPreview) {
          const formattedDate = new Date(row.target_date + "T00:00:00").toLocaleDateString(
            "en-US",
            { month: "short", year: "numeric" },
          );
          const fromClause =
            row.baseline_value !== null && row.baseline_unit
              ? `from ${row.baseline_value} ${row.baseline_unit} `
              : "";
          const confidence = row.confidence_level || "unspecified";
          const methodLabel = row.measurement_method
            ? METHOD_LABEL_MAP[row.measurement_method] || row.measurement_method
            : "method TBD";
          previewSentence = `Reduce ${row.metric_name} ${fromClause}to ${row.target_value} ${row.target_unit} by ${formattedDate} — ${confidence} confidence, measured via ${methodLabel}.`;
        }

        return (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-lg p-4 mb-3 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-slate-700">
                Outcome Hypothesis {i + 1}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={isFirst}
                  onClick={() => moveRow(i, -1)}
                  className={`p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 ${
                    isFirst ? "opacity-30 pointer-events-none" : ""
                  }`}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  disabled={isLast}
                  onClick={() => moveRow(i, 1)}
                  className={`p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 ${
                    isLast ? "opacity-30 pointer-events-none" : ""
                  }`}
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  type="button"
                  disabled={onlyOne}
                  onClick={() => deleteRow(i)}
                  className={`p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 ${
                    onlyOne ? "opacity-30 pointer-events-none" : ""
                  }`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Category */}
              <div className="col-span-2">
                <Label>Category</Label>
                <Select
                  value={row.metric_category || undefined}
                  onValueChange={(v) => updateRow(i, "metric_category", v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Metric Name */}
              <div className="col-span-2">
                <Label>Metric Name</Label>
                <Input
                  className="mt-1"
                  value={row.metric_name}
                  placeholder="e.g. Site Energy Use Intensity reduction"
                  onChange={(e) => updateRow(i, "metric_name", e.target.value)}
                />
                {row.metric_name.length > 0 && row.metric_name.length < 15 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Be specific — describe a measurable noun (15+ characters).
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={row.description}
                  placeholder="What does this metric measure and why was it chosen?"
                  onChange={(e) => updateRow(i, "description", e.target.value)}
                />
              </div>

              {/* Baseline Value */}
              <div>
                <Label>Baseline Value</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={row.baseline_value ?? ""}
                  onChange={(e) =>
                    updateRow(
                      i,
                      "baseline_value",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </div>

              {/* Baseline Unit */}
              <div>
                <Label>Baseline Unit</Label>
                <Input
                  className="mt-1"
                  value={row.baseline_unit}
                  placeholder="e.g. kWh/m², tCO2e, m³"
                  onChange={(e) => updateRow(i, "baseline_unit", e.target.value)}
                />
              </div>

              {/* Target Value */}
              <div>
                <Label>Target Value</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={row.target_value ?? ""}
                  onChange={(e) =>
                    updateRow(
                      i,
                      "target_value",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </div>

              {/* Target Unit */}
              <div>
                <Label>Target Unit</Label>
                <Input
                  className="mt-1"
                  value={row.target_unit}
                  placeholder="e.g. kWh/m², tCO2e, m³"
                  onChange={(e) => updateRow(i, "target_unit", e.target.value)}
                />
                {unitsMismatch && (
                  <p className="text-xs text-amber-600 mt-1">
                    Baseline and target units must match for reduction % to be
                    calculated correctly.
                  </p>
                )}
              </div>

              {/* Reduction % */}
              {showReduction && (
                <div className="col-span-2">
                  {reductionPct >= 0 ? (
                    <p className="text-sm font-medium text-[#0E7A65] mt-1">
                      Reduction: {reductionPct.toFixed(2)}%
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-amber-600 mt-1">
                      Increase: {Math.abs(reductionPct).toFixed(2)}%
                    </p>
                  )}
                </div>
              )}

              {/* Target Date */}
              <div>
                <Label>Target Date</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={row.target_date}
                  onChange={(e) => updateRow(i, "target_date", e.target.value)}
                />
              </div>

              {/* Measurement Method */}
              <div>
                <Label>Measurement Method</Label>
                <Select
                  value={row.measurement_method || undefined}
                  onValueChange={(v) => {
                    if (v.startsWith("__group_")) return;
                    updateRow(i, "measurement_method", v);
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a method" />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_GROUPS.map((group) => (
                      <div key={group.key}>
                        <SelectItem
                          value={`__group_${group.key}__`}
                          disabled
                          className="text-xs font-semibold text-slate-400 uppercase tracking-wide cursor-default"
                        >
                          {group.label}
                        </SelectItem>
                        {group.items.map(([v, l]) => (
                          <SelectItem key={v} value={v}>
                            {l}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Confidence Level */}
              <div>
                <Label>Confidence Level</Label>
                <Select
                  value={row.confidence_level || undefined}
                  onValueChange={(v) => updateRow(i, "confidence_level", v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select confidence" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFIDENCE_OPTIONS.map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={row.notes}
                  placeholder="Methodology caveats, data sources, assumptions"
                  onChange={(e) => updateRow(i, "notes", e.target.value)}
                />
              </div>
            </div>

            {showPreview && (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 mt-3">
                <p className="text-xs text-slate-400 font-medium mb-1">Preview</p>
                <p className="text-xs text-slate-500 italic">{previewSentence}</p>
              </div>
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        className="w-full mt-3 border-[#0E7A65] text-[#0E7A65] hover:text-[#0E7A65]"
        onClick={() =>
          onChange([...rows, createBlankOutcomeHypothesisRow(rows.length)])
        }
      >
        Add Outcome Hypothesis
      </Button>
    </div>
  );
}
