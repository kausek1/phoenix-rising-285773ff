import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { XMatrixGoal, XMatrixObjective, XMatrixPriority, XMatrixKPI, XMatrixOwner, CorrelationStrength } from "@/types/database";

interface Props {
  clientId: string | null;
  goals: XMatrixGoal[];
  objectives: XMatrixObjective[];
  priorities: XMatrixPriority[];
  kpis: XMatrixKPI[];
  owners: XMatrixOwner[];
  canEdit: boolean;
}

const PAIRS = [
  { label: "Goals ↔ Objectives", table: "xmatrix_goal_objective_correlations", rowKey: "goal_id", colKey: "objective_id", rowType: "goals" as const, colType: "objectives" as const },
  { label: "Objectives ↔ Priorities", table: "xmatrix_objective_priority_correlations", rowKey: "objective_id", colKey: "priority_id", rowType: "objectives" as const, colType: "priorities" as const },
  { label: "Priorities ↔ KPIs", table: "xmatrix_priority_kpi_correlations", rowKey: "priority_id", colKey: "kpi_id", rowType: "priorities" as const, colType: "kpis" as const },
  { label: "KPIs ↔ Owners", table: "xmatrix_kpi_owner_correlations", rowKey: "kpi_id", colKey: "owner_id", rowType: "kpis" as const, colType: "owners" as const },
  { label: "Goals ↔ Priorities", table: "xmatrix_goal_priority_correlations", rowKey: "goal_id", colKey: "priority_id", rowType: "goals" as const, colType: "priorities" as const },
  { label: "Objectives ↔ KPIs", table: "xmatrix_objective_kpi_correlations", rowKey: "objective_id", colKey: "kpi_id", rowType: "objectives" as const, colType: "kpis" as const },
];

const STRENGTH_CYCLE: CorrelationStrength[] = ["none", "weak", "medium", "strong"];
const STRENGTH_SYMBOL: Record<CorrelationStrength, string> = { none: "–", weak: "○", medium: "◑", strong: "●" };
const STRENGTH_BG: Record<CorrelationStrength, string> = { none: "bg-card", weak: "bg-muted", medium: "bg-warning/10", strong: "bg-success/10" };

function entityLabel(item: any): string {
  return item.title || item.name || "—";
}

export default function CorrelationEditor({ clientId, goals, objectives, priorities, kpis, owners, canEdit }: Props) {
  const [pairIdx, setPairIdx] = useState(0);
  const [correlations, setCorrelations] = useState<Record<string, CorrelationStrength>>({});

  const pair = PAIRS[pairIdx];

  const entitiesMap: Record<string, any[]> = { goals, objectives, priorities, kpis, owners };
  const rows = entitiesMap[pair.rowType];
  const cols = entitiesMap[pair.colType];

  const fetchCorrelations = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase.from(pair.table).select("*").eq("client_id", clientId);
    const map: Record<string, CorrelationStrength> = {};
    (data || []).forEach((c: any) => {
      map[`${c[pair.rowKey]}_${c[pair.colKey]}`] = c.strength;
    });
    setCorrelations(map);
  }, [clientId, pair]);

  useEffect(() => { fetchCorrelations(); }, [fetchCorrelations]);

  async function cycleStrength(rowId: string, colId: string) {
    if (!canEdit || !clientId) return;
    const key = `${rowId}_${colId}`;
    const current = correlations[key] || "none";
    const nextIdx = (STRENGTH_CYCLE.indexOf(current) + 1) % STRENGTH_CYCLE.length;
    const next = STRENGTH_CYCLE[nextIdx];

    setCorrelations(prev => ({ ...prev, [key]: next }));

    if (next === "none") {
      await supabase.from(pair.table).delete()
        .eq("client_id", clientId)
        .eq(pair.rowKey, rowId)
        .eq(pair.colKey, colId);
    } else {
      const existing = await supabase.from(pair.table).select("id")
        .eq("client_id", clientId).eq(pair.rowKey, rowId).eq(pair.colKey, colId).maybeSingle();
      if (existing.data) {
        await supabase.from(pair.table).update({ strength: next }).eq("id", existing.data.id);
      } else {
        await supabase.from(pair.table).insert({
          client_id: clientId,
          [pair.rowKey]: rowId,
          [pair.colKey]: colId,
          strength: next,
        });
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Correlation Editor</CardTitle>
        <div className="mt-2">
          <Label>Layer Pair</Label>
          <Select value={String(pairIdx)} onValueChange={v => setPairIdx(Number(v))}>
            <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAIRS.map((p, i) => <SelectItem key={i} value={String(i)}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 || cols.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">Add entities to both layers to use the correlation editor.</p>
        ) : (
          <table className="text-sm border-collapse">
            <thead>
              <tr>
                <th className="min-w-[200px] p-2 border text-left text-muted-foreground align-bottom">↓ / →</th>
                {cols.map(c => (
                  <th key={c.id} className="w-12 border p-0 align-bottom">
                    <div className="h-[300px] w-12 flex items-end justify-center pb-2 overflow-hidden">
                      <span
                        className="block text-xs font-medium text-foreground"
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "normal", wordBreak: "break-word", maxHeight: "280px" }}
                      >
                        {entityLabel(c)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="min-w-[200px] p-2 border font-medium text-left">{entityLabel(r)}</td>
                  {cols.map(c => {
                    const strength = correlations[`${r.id}_${c.id}`] || "none";
                    return (
                      <td
                        key={c.id}
                        className={`w-12 h-12 border text-center cursor-pointer select-none text-lg transition-colors ${STRENGTH_BG[strength]} hover:ring-2 hover:ring-accent/50`}
                        onClick={() => cycleStrength(r.id, c.id)}
                        title={`${strength} — click to cycle`}
                      >
                        {STRENGTH_SYMBOL[strength]}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
          <span>● Strong</span><span>◑ Medium</span><span>○ Weak</span><span>– None</span>
        </div>
      </CardContent>
    </Card>
  );
}
