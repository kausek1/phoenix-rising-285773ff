import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Initiative, LeanBusinessCase, RiskLevel, LBCDecision, FinancialMethod } from "@/types/database";

interface Props {
  clientId: string | null;
  editId: string | null;
  onSaved: () => void;
}

const RISK_LEVELS: RiskLevel[] = ["very_high", "high", "normal", "low"];
const DECISIONS: LBCDecision[] = ["approved", "pivot", "deferred", "not_approved"];
const FIN_METHODS: FinancialMethod[] = ["simple_payback", "npv"];

export default function LBCForm({ clientId, editId, onSaved }: Props) {
  const [init, setInit] = useState<Partial<Initiative>>({ stage: "funnel", impacts_business: false, impacts_environmental: false, impacts_people: false });
  const [lbc, setLbc] = useState<Partial<LeanBusinessCase>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      const { data: i } = await supabase.from("initiatives").select("*").eq("id", editId).single();
      if (i) setInit(i as Initiative);
      const { data: l } = await supabase.from("lean_business_cases").select("*").eq("initiative_id", editId).maybeSingle();
      if (l) setLbc(l as LeanBusinessCase);
    })();
  }, [editId]);

  async function handleSave() {
    if (!clientId) return;
    setSaving(true);
    try {
      if (editId) {
        const { id, client_id, created_at, updated_at, wsjf_score, wsjf_score_raw, ...initPayload } = init as any;
        await supabase.from("initiatives").update(initPayload).eq("id", editId);
        const { id: lId, client_id: lc, created_at: lca, updated_at: lua, initiative_id, ...lbcPayload } = lbc as any;
        if (lbc.id) {
          await supabase.from("lean_business_cases").update(lbcPayload).eq("id", lbc.id);
        }
      } else {
        const { id, client_id, created_at, updated_at, wsjf_score, wsjf_score_raw, ...initPayload } = init as any;
        const { data: newInit } = await supabase.from("initiatives").insert({ ...initPayload, client_id: clientId }).select().single();
        if (newInit) {
          const { id: lId, client_id: lc, created_at: lca, updated_at: lua, initiative_id, ...lbcPayload } = lbc as any;
          await supabase.from("lean_business_cases").insert({ ...lbcPayload, initiative_id: newInit.id, client_id: clientId });
        }
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const si = (k: string, v: any) => setInit(prev => ({ ...prev, [k]: v }));
  const sl = (k: string, v: any) => setLbc(prev => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-semibold text-sm text-primary">Section 1 — Identity</h3>
        <div><Label>Title *</Label><Input value={init.title || ""} onChange={e => si("title", e.target.value)} /></div>
        <div><Label>Description</Label><Textarea value={init.description || ""} onChange={e => si("description", e.target.value)} /></div>
        <div><Label>Owner Name</Label><Input value={init.owner_name || ""} onChange={e => si("owner_name", e.target.value)} /></div>
        <div><Label>Key Stakeholders</Label><Textarea value={lbc.key_stakeholders || ""} onChange={e => sl("key_stakeholders", e.target.value)} /></div>
        <div><Label>Funnel Entry Date</Label><Input type="date" value={init.funnel_entry_date || ""} onChange={e => si("funnel_entry_date", e.target.value)} /></div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-sm text-primary">Section 2 — Problem</h3>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={init.impacts_business} onCheckedChange={v => si("impacts_business", v)} />Business</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={init.impacts_environmental} onCheckedChange={v => si("impacts_environmental", v)} />Environmental</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={init.impacts_people} onCheckedChange={v => si("impacts_people", v)} />People/Social</label>
        </div>
        <div><Label>In Scope</Label><Textarea value={lbc.in_scope || ""} onChange={e => sl("in_scope", e.target.value)} /></div>
        <div><Label>Out of Scope</Label><Textarea value={lbc.out_of_scope || ""} onChange={e => sl("out_of_scope", e.target.value)} /></div>
        <div><Label>Impact Outcome Hypothesis</Label><Textarea value={lbc.impact_outcome_hypothesis || ""} onChange={e => sl("impact_outcome_hypothesis", e.target.value)} /></div>
        <div><Label>Leading Indicators</Label><Textarea value={lbc.leading_indicators || ""} onChange={e => sl("leading_indicators", e.target.value)} /></div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-sm text-primary">Section 3 — Solution</h3>
        <div><Label>MVP Features</Label><Textarea value={lbc.mvp_features || ""} onChange={e => sl("mvp_features", e.target.value)} /></div>
        <div><Label>Additional Features</Label><Textarea value={lbc.additional_features || ""} onChange={e => sl("additional_features", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Est. MVP Months</Label><Input type="number" value={lbc.estimated_mvp_months ?? ""} onChange={e => sl("estimated_mvp_months", e.target.value ? Number(e.target.value) : null)} /></div>
          <div><Label>Est. Deploy Months</Label><Input type="number" value={lbc.estimated_deploy_months ?? ""} onChange={e => sl("estimated_deploy_months", e.target.value ? Number(e.target.value) : null)} /></div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-sm text-primary">Section 4 — Analysis</h3>
        <div><Label>Sources Summary</Label><Textarea value={lbc.sources_summary || ""} onChange={e => sl("sources_summary", e.target.value)} /></div>
        <div><Label>Customer Impact</Label><Textarea value={lbc.customer_impact || ""} onChange={e => sl("customer_impact", e.target.value)} /></div>
        <div><Label>Value Chain Impact</Label><Textarea value={lbc.value_chain_impact || ""} onChange={e => sl("value_chain_impact", e.target.value)} /></div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-sm text-primary">Section 5 — Financials</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>MVP Cost</Label><Input type="number" value={init.mvp_cost ?? ""} onChange={e => si("mvp_cost", e.target.value ? Number(e.target.value) : null)} /></div>
          <div><Label>Est. Deployment Cost</Label><Input type="number" value={init.estimated_deployment_cost ?? ""} onChange={e => si("estimated_deployment_cost", e.target.value ? Number(e.target.value) : null)} /></div>
          <div><Label>Est. Annual OpEx</Label><Input type="number" value={init.estimated_annual_opex ?? ""} onChange={e => si("estimated_annual_opex", e.target.value ? Number(e.target.value) : null)} /></div>
          <div><Label>Est. Annual Savings</Label><Input type="number" value={init.estimated_annual_savings ?? ""} onChange={e => si("estimated_annual_savings", e.target.value ? Number(e.target.value) : null)} /></div>
        </div>
        <div><Label>Financial Method</Label>
          <Select value={init.financial_method || "__unassigned__"} onValueChange={v => si("financial_method", v === "__unassigned__" ? null : v)}>
            <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">None</SelectItem>
              {FIN_METHODS.map(m => <SelectItem key={m} value={m}>{m === "simple_payback" ? "Simple Payback" : "NPV"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Simple Payback Years</Label><Input type="number" value={init.simple_payback_years ?? ""} onChange={e => si("simple_payback_years", e.target.value ? Number(e.target.value) : null)} /></div>
          <div><Label>NPV</Label><Input type="number" value={init.npv ?? ""} onChange={e => si("npv", e.target.value ? Number(e.target.value) : null)} /></div>
          <div><Label>Discount Rate</Label><Input type="number" step="0.01" value={init.discount_rate ?? ""} onChange={e => si("discount_rate", e.target.value ? Number(e.target.value) : null)} /></div>
          <div><Label>Est. CO₂ Reduction</Label><Input type="number" value={init.estimated_co2_reduction ?? ""} onChange={e => si("estimated_co2_reduction", e.target.value ? Number(e.target.value) : null)} /></div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-sm text-primary">Section 6 — Strategy</h3>
        <div><Label>Development Strategy</Label><Textarea value={lbc.development_strategy || ""} onChange={e => sl("development_strategy", e.target.value)} /></div>
        <div><Label>Sequencing & Dependencies</Label><Textarea value={lbc.sequencing_dependencies || ""} onChange={e => sl("sequencing_dependencies", e.target.value)} /></div>
        <div><Label>Risk Level</Label>
          <Select value={init.risk_level || "__unassigned__"} onValueChange={v => si("risk_level", v === "__unassigned__" ? null : v)}>
            <SelectTrigger><SelectValue placeholder="Select risk" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">None</SelectItem>
              {RISK_LEVELS.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Risk Narrative</Label><Textarea value={lbc.risk_narrative || ""} onChange={e => sl("risk_narrative", e.target.value)} /></div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-sm text-primary">Section 7 — Decision</h3>
        <div><Label>Go/No-Go Decision</Label>
          <Select value={init.lbc_decision || "__unassigned__"} onValueChange={v => si("lbc_decision", v === "__unassigned__" ? null : v)}>
            <SelectTrigger><SelectValue placeholder="Select decision" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">Pending</SelectItem>
              {DECISIONS.map(d => <SelectItem key={d} value={d}>{d.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Other Notes</Label><Textarea value={lbc.other_notes || ""} onChange={e => sl("other_notes", e.target.value)} /></div>
      </section>

      <Button className="w-full" onClick={handleSave} disabled={saving || !init.title}>
        {saving ? "Saving…" : "Save Initiative"}
      </Button>
    </div>
  );
}
