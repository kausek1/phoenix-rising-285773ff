import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  type LeadingIndicatorRow,
  createBlankLeadingIndicatorRow,
} from "@/types/metrics";

interface Props {
  initiativeId: string | null;
  clientId: string;
  rows: LeadingIndicatorRow[];
  onChange: (rows: LeadingIndicatorRow[]) => void;
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

const FREQUENCY_OPTIONS: Array<[string, string]> = [
  ["post_mvp", "At or shortly after MVP"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["annual", "Annual"],
];

const FREQUENCY_LABEL_MAP: Record<string, string> = {
  post_mvp: "at or shortly after MVP",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export default function LeadingIndicatorSection({ rows, onChange }: Props) {
  const updateRow = (i: number, field: keyof LeadingIndicatorRow, value: any) => {
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
        Leading Indicators
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        Is the project progressing, and how will the organization know whether
        to proceed to full deployment after the MVP, or pivot to a new solution?
        Leading indicators are short-term signals — process or activity measures
        that demonstrate progress, or outcome measures obtained shortly after
        completion of all MVP Features — that predict whether the Outcome
        Hypothesis is likely to be achieved, prior to committing to full
        deployment.
      </p>

      {rows.map((row, i) => {
        const isFirst = i === 0;
        const isLast = i === rows.length - 1;
        const onlyOne = rows.length === 1;

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
          const freqLabel = row.update_frequency
            ? FREQUENCY_LABEL_MAP[row.update_frequency] || row.update_frequency
            : "frequency TBD";
          previewSentence = `Track ${row.metric_name} — target ${row.target_value} ${row.target_unit} by ${formattedDate}, updated ${freqLabel}. Alert if ${row.alert_threshold_pct}% below target.`;
        }

        return (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-lg p-4 mb-3 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-slate-700">
                Leading Indicator {i + 1}
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
                  placeholder="e.g. Weekly metering coverage across all sites"
                  onChange={(e) => updateRow(i, "metric_name", e.target.value)}
                />
                {row.metric_name.length > 0 && row.metric_name.length < 15 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Be specific — describe a measurable noun (15+ characters).
                  </p>
                )}
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
                  placeholder="e.g. %, units, hours, score, Y/N"
                  onChange={(e) => updateRow(i, "target_unit", e.target.value)}
                />
              </div>

              {/* Target Date */}
              <div>
                <Label>MVP Target Date</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={row.target_date}
                  onChange={(e) => updateRow(i, "target_date", e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Typically a sprint week end date
                </p>
              </div>

              {/* Update Frequency */}
              <div>
                <Label>Update Frequency</Label>
                <Select
                  value={row.update_frequency || undefined}
                  onValueChange={(v) => updateRow(i, "update_frequency", v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Alert Threshold % */}
              <div>
                <Label>Alert Threshold %</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={row.alert_threshold_pct ?? ""}
                  onChange={(e) =>
                    updateRow(
                      i,
                      "alert_threshold_pct",
                      e.target.value ? Number(e.target.value) : 15,
                    )
                  }
                />
                <p className="text-xs text-slate-400 mt-1">
                  % below target, post MVP Target Date, that triggers an at-risk warning
                </p>
              </div>

              {/* Notes */}
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={row.notes}
                  placeholder="Context, caveats, or data source for this indicator"
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
          onChange([...rows, createBlankLeadingIndicatorRow(rows.length)])
        }
      >
        Add Leading Indicator
      </Button>
    </div>
  );
}
