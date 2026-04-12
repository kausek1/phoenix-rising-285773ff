import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Printer } from "lucide-react";
import type { Initiative, LeanBusinessCase, RiskLevel, LBCDecision, FinancialMethod, CorrelationStrength } from "@/types/database";

const RISK_LEVELS: RiskLevel[] = ["very_high", "high", "normal", "low"];
const DECISIONS: LBCDecision[] = ["approved", "pivot", "deferred", "not_approved"];

interface Alignment {
  objective_id: string;
  objective_title: string;
  strength: CorrelationStrength;
}

interface Props {
  editId?: string;
}

export default function LBCFormPage({ editId }: Props) {
  const { clientId, role, client } = useAuth();
  const navigate = useNavigate();
  const readOnly = role === "viewer";

  const [init, setInit] = useState<Partial<Initiative>>({
    stage: "funnel",
    impacts_business: false,
    impacts_environmental: false,
    impacts_people: false,
    funnel_entry_date: new Date().toISOString().split("T")[0],
  });
  const [lbc, setLbc] = useState<Partial<LeanBusinessCase>>({});
  const [alignments, setAlignments] = useState<Alignment[]>([]);
  const [riskWeights, setRiskWeights] = useState<Record<string, number>>({});
  const [alignmentConfig, setAlignmentConfig] = useState<{ strong: number; medium: number; weak: number; cap: number }>({
    strong: 5, medium: 2, weak: 1, cap: 13,
  });
  const [saving, setSaving] = useState(false);
  const [lbcNumber, setLbcNumber] = useState<number | null>(null);

  // Fetch wsjf_config for risk weights and alignment config
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const { data: configs } = await supabase.from("wsjf_config").select("*").eq("client_id", clientId);
      if (configs) {
        const weights: Record<string, number> = {};
        for (const c of configs as any[]) {
          weights[c.risk_level] = c.risk_weight;
          if (c.alignment_points) {
            setAlignmentConfig(prev => ({ ...prev, ...c.alignment_points }));
          }
          if (c.alignment_cap != null) {
            setAlignmentConfig(prev => ({ ...prev, cap: c.alignment_cap }));
          }
        }
        setRiskWeights(weights);
      }
    })();
  }, [clientId]);

  // Fetch objectives for alignments
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const { data: objs } = await supabase
        .from("xmatrix_annual_objectives").select("id, title")
        .eq("client_id", clientId);

      let existingAlignments: any[] = [];
      if (editId) {
        const { data } = await supabase
          .from("lbc_objective_alignments").select("*")
          .eq("initiative_id", editId);
        existingAlignments = data || [];
      }

      const alignMap = new Map(existingAlignments.map((a: any) => [a.objective_id, a.strength]));
      setAlignments(
        (objs || []).map((o: any) => ({
          objective_id: o.id,
          objective_title: o.title,
          strength: (alignMap.get(o.id) as CorrelationStrength) || "none",
        }))
      );
    })();
  }, [clientId, editId]);

  // Load existing data
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const { data: i } = await supabase.from("initiatives").select("*").eq("id", editId).single();
      if (i) setInit(i as Initiative);
      const { data: l } = await supabase.from("lean_business_cases").select("*").eq("initiative_id", editId).maybeSingle();
      if (l) {
        setLbc(l as LeanBusinessCase);
        setLbcNumber((l as any).lbc_number ?? null);
      }
    })();
  }, [editId]);

  const si = (k: string, v: any) => setInit(prev => ({ ...prev, [k]: v }));
  const sl = (k: string, v: any) => setLbc(prev => ({ ...prev, [k]: v }));

  const handleRiskChange = (v: string) => {
    const level = v === "__unassigned__" ? null : v;
    si("risk_level", level);
    if (level && riskWeights[level] != null) {
      si("risk_weight", riskWeights[level]);
    }
  };

  const setAlignmentStrength = (objId: string, strength: CorrelationStrength) => {
    setAlignments(prev => prev.map(a => a.objective_id === objId ? { ...a, strength } : a));
  };

  const computeAlignmentScore = useCallback(() => {
    const pts: Record<string, number> = {
      strong: alignmentConfig.strong,
      medium: alignmentConfig.medium,
      weak: alignmentConfig.weak,
      none: 0,
    };
    const raw = alignments.reduce((sum, a) => sum + (pts[a.strength] || 0), 0);
    return Math.max(1, Math.min(alignmentConfig.cap, raw));
  }, [alignments, alignmentConfig]);

  async function handleSave() {
    if (!clientId || !init.title) return;
    setSaving(true);
    try {
      const alignmentScore = computeAlignmentScore();
      const initFields: any = { ...init, strategic_alignment: alignmentScore };
      // Remove computed/system fields
      delete initFields.id; delete initFields.client_id;
      delete initFields.created_at; delete initFields.updated_at;
      delete initFields.wsjf_score; delete initFields.wsjf_score_raw;

      const lbcFields: any = { ...lbc };
      delete lbcFields.id; delete lbcFields.client_id;
      delete lbcFields.created_at; delete lbcFields.updated_at;
      delete lbcFields.initiative_id; delete lbcFields.lbc_number;

      if (editId) {
        await supabase.from("initiatives").update(initFields).eq("id", editId);
        if (lbc.id) {
          await supabase.from("lean_business_cases").update(lbcFields).eq("id", lbc.id);
        }
        // Upsert alignments
        const active = alignments.filter(a => a.strength !== "none");
        // Delete all existing then re-insert
        await supabase.from("lbc_objective_alignments").delete().eq("initiative_id", editId);
        if (active.length > 0) {
          await supabase.from("lbc_objective_alignments").insert(
            active.map(a => ({
              initiative_id: editId,
              objective_id: a.objective_id,
              strength: a.strength,
              client_id: clientId,
            }))
          );
        }
      } else {
        const { data: newInit } = await supabase
          .from("initiatives")
          .insert({ ...initFields, client_id: clientId })
          .select().single();
        if (newInit) {
          await supabase
            .from("lean_business_cases")
            .insert({ ...lbcFields, initiative_id: newInit.id, client_id: clientId });

          const active = alignments.filter(a => a.strength !== "none");
          if (active.length > 0) {
            await supabase.from("lbc_objective_alignments").insert(
              active.map(a => ({
                initiative_id: newInit.id,
                objective_id: a.objective_id,
                strength: a.strength,
                client_id: clientId,
              }))
            );
          }
          navigate({ to: "/lbc/$id", params: { id: newInit.id } });
          return;
        }
      }
      // Refresh data after edit save
      if (editId) {
        const { data: l } = await supabase.from("lean_business_cases").select("*").eq("initiative_id", editId).maybeSingle();
        if (l) { setLbc(l as LeanBusinessCase); setLbcNumber((l as any).lbc_number ?? null); }
      }
    } finally {
      setSaving(false);
    }
  }

  const handlePrint = () => {
    // Expand all accordions before print
    const details = document.querySelectorAll("[data-state='closed']");
    details.forEach((el) => (el as HTMLElement).click());
    setTimeout(() => window.print(), 300);
  };

  const displayLbcNumber = lbcNumber ? `LBC-${String(lbcNumber).padStart(3, "0")}` : "New";

  const fieldProps = (disabled?: boolean) => readOnly || disabled ? { disabled: true } : {};

  return (
    <div className="max-w-3xl mx-auto lbc-form-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 lbc-form-header">
        <div className="flex items-center gap-3">
          <Link to="/lbc">
            <Button variant="ghost" size="icon" className="print-hide">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <span className="text-xs font-mono text-muted-foreground">{displayLbcNumber}</span>
            <Input
              value={init.title || ""}
              onChange={e => si("title", e.target.value)}
              placeholder="Initiative Title"
              className="text-lg font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0"
              {...fieldProps()}
            />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handlePrint} className="print-hide">
          <Printer className="h-4 w-4 mr-1" /> Print
        </Button>
      </div>

      {/* Print header (hidden on screen) */}
      <div className="lbc-print-header hidden">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-bold tracking-widest">PHOENIX</span>
          <span>—</span>
          <span className="font-semibold">Lean Business Case</span>
        </div>
        <div className="text-lg font-bold">{displayLbcNumber}: {init.title || "Untitled"}</div>
        <div className="text-sm text-muted-foreground mt-1">{client?.name} · {new Date().toLocaleDateString()}</div>
      </div>

      <Accordion
        type="multiple"
        defaultValue={["s1", "s2", "s3", "s4", "s5", "s6", "s7"]}
        className="space-y-2"
      >
        {/* Section 1 — Identity */}
        <AccordionItem value="s1" className="border rounded-lg px-4">
          <AccordionTrigger className="font-semibold text-sm text-primary">
            Section 1 — Identity
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div>
              <Label className="text-xs text-muted-foreground">Box 1: Funnel Entry Date</Label>
              <Input type="date" value={init.funnel_entry_date || ""} onChange={e => si("funnel_entry_date", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 2: Initiative Owner</Label>
              <Input value={(lbc as any).initiative_owner_name || init.owner_name || ""} onChange={e => { sl("initiative_owner_name", e.target.value); si("owner_name", e.target.value); }} placeholder="Owner name" {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 3: Key Stakeholders</Label>
              <Textarea value={lbc.key_stakeholders || ""} onChange={e => sl("key_stakeholders", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 4: Description</Label>
              <Textarea value={init.description || ""} onChange={e => si("description", e.target.value)} {...fieldProps()} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 2 — Problem Statement */}
        <AccordionItem value="s2" className="border rounded-lg px-4">
          <AccordionTrigger className="font-semibold text-sm text-primary">
            Section 2 — Problem Statement
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div>
              <Label className="text-xs text-muted-foreground">Box 5: Impacted Areas</Label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!init.impacts_business} onCheckedChange={v => si("impacts_business", v)} disabled={readOnly} />
                  Business
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!init.impacts_environmental} onCheckedChange={v => si("impacts_environmental", v)} disabled={readOnly} />
                  Environmental
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!init.impacts_people} onCheckedChange={v => si("impacts_people", v)} disabled={readOnly} />
                  People/Social
                </label>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 6: In Scope</Label>
              <Textarea value={lbc.in_scope || ""} onChange={e => sl("in_scope", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 7: Out of Scope</Label>
              <Textarea value={lbc.out_of_scope || ""} onChange={e => sl("out_of_scope", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 8: Impact Outcome Hypothesis</Label>
              <Textarea value={lbc.impact_outcome_hypothesis || ""} onChange={e => sl("impact_outcome_hypothesis", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 9: Leading Indicators</Label>
              <Textarea value={lbc.leading_indicators || ""} onChange={e => sl("leading_indicators", e.target.value)} {...fieldProps()} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 3 — Solution */}
        <AccordionItem value="s3" className="border rounded-lg px-4">
          <AccordionTrigger className="font-semibold text-sm text-primary">
            Section 3 — Solution
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div>
              <Label className="text-xs text-muted-foreground">Box 10: MVP Features</Label>
              <Textarea value={lbc.mvp_features || ""} onChange={e => sl("mvp_features", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 11: Additional Features post-MVP</Label>
              <Textarea value={lbc.additional_features || ""} onChange={e => sl("additional_features", e.target.value)} {...fieldProps()} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Box 10a: Est. MVP Months</Label>
                <Input type="number" value={lbc.estimated_mvp_months ?? ""} onChange={e => sl("estimated_mvp_months", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Box 11a: Est. Deploy Months</Label>
                <Input type="number" value={lbc.estimated_deploy_months ?? ""} onChange={e => sl("estimated_deploy_months", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 4 — Analysis */}
        <AccordionItem value="s4" className="border rounded-lg px-4">
          <AccordionTrigger className="font-semibold text-sm text-primary">
            Section 4 — Analysis
            {alignments.some(a => a.strength !== "none") && (
              <span className="ml-2 text-xs font-normal text-accent">
                Alignment Score: {computeAlignmentScore()}
              </span>
            )}
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div>
              <Label className="text-xs text-muted-foreground">Box 12: Sources Summary</Label>
              <Textarea value={lbc.sources_summary || ""} onChange={e => sl("sources_summary", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 14: Customer/Program Impact</Label>
              <Textarea value={lbc.customer_impact || ""} onChange={e => sl("customer_impact", e.target.value)} {...fieldProps()} />
            </div>

            {/* Box 15: Strategic Objective Alignments */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Box 15: Strategic Objective Alignments</Label>
              {alignments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No annual objectives defined yet.</p>
              ) : (
                <div className="space-y-2 border rounded-md p-3">
                  {alignments.map(a => (
                    <div key={a.objective_id} className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate flex-1">{a.objective_title}</span>
                      <Select
                        value={a.strength}
                        onValueChange={v => setAlignmentStrength(a.objective_id, v as CorrelationStrength)}
                        disabled={readOnly}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="weak">Weak</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="strong">Strong</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Box 16: Value Chain Impact</Label>
              <Textarea value={lbc.value_chain_impact || ""} onChange={e => sl("value_chain_impact", e.target.value)} {...fieldProps()} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 5 — Forecasted Costs & Returns */}
        <AccordionItem value="s5" className="border rounded-lg px-4">
          <AccordionTrigger className="font-semibold text-sm text-primary">
            Section 5 — Forecasted Costs & Returns
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Box 17: MVP Cost</Label>
                <Input type="number" value={init.mvp_cost ?? ""} onChange={e => si("mvp_cost", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Box 18: Est. Deployment Cost</Label>
                <Input type="number" value={init.estimated_deployment_cost ?? ""} onChange={e => si("estimated_deployment_cost", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 17 Narrative: MVP Cost Assumptions</Label>
              <Textarea value={(lbc as any).mvp_cost_narrative || ""} onChange={e => sl("mvp_cost_narrative", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 18 Narrative: Deployment Cost Assumptions</Label>
              <Textarea value={(lbc as any).deployment_cost_narrative || ""} onChange={e => sl("deployment_cost_narrative", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 19: Estimate of Return</Label>
              <Textarea value={(lbc as any).estimate_of_return_narrative || ""} onChange={e => sl("estimate_of_return_narrative", e.target.value)} {...fieldProps()} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Annual Operating Cost</Label>
                <Input type="number" value={init.estimated_annual_opex ?? ""} onChange={e => si("estimated_annual_opex", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Annual Savings/Revenue</Label>
                <Input type="number" value={init.estimated_annual_savings ?? ""} onChange={e => si("estimated_annual_savings", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Financial Method</Label>
              <RadioGroup
                value={init.financial_method || ""}
                onValueChange={v => si("financial_method", v || null)}
                className="flex gap-4 mt-1"
                disabled={readOnly}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="simple_payback" id="fm-sp" />
                  <Label htmlFor="fm-sp" className="text-sm">Simple Payback</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="npv" id="fm-npv" />
                  <Label htmlFor="fm-npv" className="text-sm">NPV</Label>
                </div>
              </RadioGroup>
            </div>

            {init.financial_method === "simple_payback" && (
              <div>
                <Label className="text-xs text-muted-foreground">Simple Payback Years</Label>
                <Input type="number" step="0.01" value={init.simple_payback_years ?? ""} onChange={e => si("simple_payback_years", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
              </div>
            )}
            {init.financial_method === "npv" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">NPV</Label>
                  <Input type="number" value={init.npv ?? ""} onChange={e => si("npv", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Discount Rate (%)</Label>
                  <Input type="number" step="0.01" value={init.discount_rate ?? ""} onChange={e => si("discount_rate", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">Est. CO₂ Reduction (tCO₂e)</Label>
              <Input type="number" value={init.estimated_co2_reduction ?? ""} onChange={e => si("estimated_co2_reduction", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 6 — Development Strategy */}
        <AccordionItem value="s6" className="border rounded-lg px-4">
          <AccordionTrigger className="font-semibold text-sm text-primary">
            Section 6 — Development Strategy
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div>
              <Label className="text-xs text-muted-foreground">Box 20: Development Strategy</Label>
              <Textarea value={lbc.development_strategy || ""} onChange={e => sl("development_strategy", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 21: Sequencing & Dependencies</Label>
              <Textarea value={lbc.sequencing_dependencies || ""} onChange={e => sl("sequencing_dependencies", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 22: Risk Level</Label>
              <Select value={init.risk_level || "__unassigned__"} onValueChange={handleRiskChange} disabled={readOnly}>
                <SelectTrigger><SelectValue placeholder="Select risk" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">None</SelectItem>
                  {RISK_LEVELS.map(r => (
                    <SelectItem key={r} value={r}>
                      {r.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Risk Narrative</Label>
              <Textarea value={lbc.risk_narrative || ""} onChange={e => sl("risk_narrative", e.target.value)} {...fieldProps()} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 7 — Decision & Notes */}
        <AccordionItem value="s7" className="border rounded-lg px-4">
          <AccordionTrigger className="font-semibold text-sm text-primary">
            Section 7 — Decision & Notes
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div>
              <Label className="text-xs text-muted-foreground">Box 13: Go/No-Go Decision</Label>
              <RadioGroup
                value={init.lbc_decision || ""}
                onValueChange={v => si("lbc_decision", v || null)}
                className="flex flex-wrap gap-4 mt-1"
                disabled={readOnly}
              >
                {DECISIONS.map(d => (
                  <div key={d} className="flex items-center gap-2">
                    <RadioGroupItem value={d} id={`dec-${d}`} />
                    <Label htmlFor={`dec-${d}`} className="text-sm">
                      {d.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 23: Attachments (links/references)</Label>
              <Textarea
                value={(() => {
                  try {
                    const arr = JSON.parse(lbc.attachments || "[]");
                    return Array.isArray(arr) ? arr.join("\n") : lbc.attachments || "";
                  } catch { return lbc.attachments || ""; }
                })()}
                onChange={e => {
                  const lines = e.target.value.split("\n").filter(Boolean);
                  sl("attachments", JSON.stringify(lines));
                }}
                placeholder="One link per line"
                {...fieldProps()}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 24: Other Notes</Label>
              <Textarea value={lbc.other_notes || ""} onChange={e => sl("other_notes", e.target.value)} {...fieldProps()} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Save */}
      {!readOnly && (
        <div className="mt-6 print-hide">
          <button
            className="lbc-save-btn w-full py-3 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !init.title}
          >
            {saving ? "Saving…" : "Save LBC"}
          </button>
        </div>
      )}
    </div>
  );
}
