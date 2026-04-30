import { Button } from "@/components/ui/button";
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

export default function LeadingIndicatorSection({ rows, onChange }: Props) {
  return (
    <div>
      <h3 className="text-base font-semibold text-[#1B4F72] mb-1">
        Leading Indicators
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        How will the team know this initiative is on track during the 90-day sprint?
        Leading indicators are short-term signals — process milestones, early
        performance readings, or activity measures — that predict whether the
        Outcome Hypothesis will be achieved.
      </p>
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-6 text-center text-sm text-slate-400">
        Leading Indicator fields coming in next prompt
      </div>
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
