import { Button } from "@/components/ui/button";
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

export default function OutcomeHypothesisSection({ rows, onChange }: Props) {
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
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-6 text-center text-sm text-slate-400">
        Outcome Hypothesis fields coming in next prompt
      </div>
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
