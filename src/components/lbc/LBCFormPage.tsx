import { useState, useEffect, useCallback, useRef } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Printer, Trash2, Plus, AlertCircle, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { Initiative, LeanBusinessCase, RiskLevel, LBCDecision, FinancialMethod, CorrelationStrength } from "@/types/database";
import { computeAutoScores } from "@/lib/wsjf-scoring";
import OutcomeHypothesisSection from "@/components/initiatives/OutcomeHypothesisSection";
import LeadingIndicatorSection from "@/components/initiatives/LeadingIndicatorSection";
import {
  type OutcomeHypothesisRow,
  type LeadingIndicatorRow,
  createBlankOutcomeHypothesisRow,
  createBlankLeadingIndicatorRow,
} from "@/types/metrics";
import { useFeatureRows } from "@/hooks/useFeatureRows";
import { createBlankFeatureRow, type FeatureStatus } from "@/types/features";

const RISK_LEVELS: RiskLevel[] = ["very_high", "high", "normal", "low"];
const DECISIONS: LBCDecision[] = ["approved", "pivot", "deferred", "not_approved"];

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground italic mt-0.5 mb-1">{children}</p>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-1.5 text-red-600 text-sm mt-1">
      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

interface Alignment {
  objective_id: string;
  objective_title: string;
  strength: CorrelationStrength;
}

interface Props {
  editId?: string;
}

export default function LBCFormPage({ editId }: Props) {
  const { clientId, role, client, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const readOnly = role === "viewer";

  const [init, setInit] = useState<Partial<Initiative>>({
    stage: "funnel",
    impacts_business: false,
    impacts_environmental: false,
    impacts_people: false,
    risk_level: "normal",
  });
  const [lbc, setLbc] = useState<Partial<LeanBusinessCase>>({
    funnel_entry_date: new Date().toISOString().split("T")[0],
  });
  const [alignments, setAlignments] = useState<Alignment[]>([]);
  const [riskWeights, setRiskWeights] = useState<Record<string, number>>({});
  const [alignmentConfig, setAlignmentConfig] = useState<{ strong: number; medium: number; weak: number; cap: number }>({
    strong: 5, medium: 2, weak: 1, cap: 13,
  });
  const [baselineTotalCo2e, setBaselineTotalCo2e] = useState<number | null>(null);
  const [scoringRubricUrl, setScoringRubricUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [lbcNumber, setLbcNumber] = useState<number | null>(null);
  const [outcomeRows, setOutcomeRows] = useState<OutcomeHypothesisRow[]>([
    createBlankOutcomeHypothesisRow(0),
  ]);
  const [leadingRows, setLeadingRows] = useState<LeadingIndicatorRow[]>([
    createBlankLeadingIndicatorRow(0),
  ]);
  const [priorities, setPriorities] = useState<Array<{ id: string; title: string }>>([]);

  // Box 10/11 — Feature decomposition (data layer from Step 2a)
  const {
    mvpRows,
    setMvpRows,
    postMvpRows,
    setPostMvpRows,
    fetchForInitiative: fetchFeaturesForInitiative,
    saveForInitiative: saveFeaturesForInitiative,
    isMvpValid,
    isPostMvpValid,
  } = useFeatureRows(clientId);
  const [featuresLoading, setFeaturesLoading] = useState<boolean>(!!editId);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [deleteFeatureIdx, setDeleteFeatureIdx] = useState<number | null>(null);
  const [deletePostMvpFeatureIdx, setDeletePostMvpFeatureIdx] = useState<number | null>(null);

  // Step 2e — three-tab restructure
  const [activeTab, setActiveTab] = useState<"business" | "features" | "metrics">("business");
  // Step 2f — Submit validation state
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("xmatrix_improvement_priorities")
      .select("id, title")
      .eq("client_id", clientId)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setPriorities((data as any) || []));
  }, [clientId]);

  useEffect(() => {
    if (!clientId || authLoading) return;
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
          if (c.baseline_total_co2e != null) {
            setBaselineTotalCo2e(c.baseline_total_co2e);
          }
          if (c.scoring_rubric_url) {
            setScoringRubricUrl(c.scoring_rubric_url);
          }
        }
        setRiskWeights(weights);
      }
    })();
  }, [clientId]);

  useEffect(() => {
    if (!clientId || authLoading) return;
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

  useEffect(() => {
    if (!editId || !clientId || authLoading) return;
    (async () => {
      const { data: i } = await supabase.from("initiatives").select("*").eq("id", editId).single();
      if (i) setInit(i as Initiative);
      const { data: l } = await supabase.from("lean_business_cases").select("*").eq("initiative_id", editId).maybeSingle();
      if (l) {
        setLbc(l as LeanBusinessCase);
        setLbcNumber((l as any).lbc_number ?? null);
      }

      const { data: metrics } = await supabase
        .from("initiative_metrics")
        .select("*")
        .eq("initiative_id", editId)
        .order("sort_order", { ascending: true });
      if (metrics && metrics.length > 0) {
        const outcomes = metrics
          .filter((m: any) => m.metric_type === "outcome_hypothesis")
          .map((m: any) => ({
            id: m.id,
            metric_category: m.metric_category ?? "",
            metric_name: m.metric_name ?? "",
            description: m.description ?? "",
            baseline_value: m.baseline_value ?? null,
            baseline_unit: m.baseline_unit ?? "",
            target_value: m.target_value ?? null,
            target_unit: m.target_unit ?? "",
            target_date: m.target_date ?? "",
            measurement_method: m.measurement_method ?? "",
            confidence_level: m.confidence_level ?? "",
            linked_xmatrix_kpi_id: m.linked_xmatrix_kpi_id ?? null,
            is_key_result: m.is_key_result ?? false,
            notes: m.notes ?? "",
            sort_order: m.sort_order ?? 0,
          }));
        const indicators = metrics
          .filter((m: any) => m.metric_type === "leading_indicator")
          .map((m: any) => ({
            id: m.id,
            metric_category: m.metric_category ?? "",
            metric_name: m.metric_name ?? "",
            description: "",
            target_value: m.target_value ?? null,
            target_unit: m.target_unit ?? "",
            target_date: m.target_date ?? "",
            update_frequency: m.update_frequency ?? "",
            alert_threshold_pct: m.alert_threshold_pct ?? 15,
            notes: m.notes ?? "",
            sort_order: m.sort_order ?? 0,
          }));
        if (outcomes.length > 0) setOutcomeRows(outcomes);
        if (indicators.length > 0) setLeadingRows(indicators);
      }
    })();
  }, [editId, clientId, authLoading]);

  // Fetch Box 10/11 feature rows in edit mode
  useEffect(() => {
    if (!editId || !clientId || authLoading) {
      if (!editId) setFeaturesLoading(false);
      return;
    }
    setFeaturesLoading(true);
    fetchFeaturesForInitiative(editId).finally(() => setFeaturesLoading(false));
  }, [editId, clientId, authLoading, fetchFeaturesForInitiative]);

  const si = (k: string, v: any) => { setInit(prev => ({ ...prev, [k]: v })); setDirty(true); };
  const sl = (k: string, v: any) => { setLbc(prev => ({ ...prev, [k]: v })); setDirty(true); };

  const setAlignmentStrengthTracked = (objId: string, strength: CorrelationStrength) => {
    setAlignmentStrength(objId, strength);
    setDirty(true);
  };

  const handleRiskChange = (v: string) => {
    si("risk_level", v);
    if (riskWeights[v] != null) {
      si("risk_weight", riskWeights[v]);
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

  async function handleSave(overrideStage?: string) {
    if (saving) return;
    if (!clientId || !init.title) return;

    const { toast } = await import("sonner");

    // Note: Submit-time validation is enforced in handleSubmit (Step 2f).
    // Save Draft intentionally bypasses validation and saves whatever is present.

    setSaving(true);

    const saveMetrics = async (savedInitiativeId: string) => {
      const completeOutcomes = outcomeRows.filter(r =>
        r.metric_name.trim().length > 0 &&
        r.metric_category &&
        r.target_value !== null &&
        r.target_unit.trim()
      );
      const completeIndicators = leadingRows.filter(r =>
        r.metric_name.trim().length > 0 &&
        r.metric_category &&
        r.target_value !== null &&
        r.target_unit.trim()
      );
      if (completeOutcomes.length === 0 && completeIndicators.length === 0) return;

      await supabase
        .from("initiative_metrics")
        .delete()
        .eq("initiative_id", savedInitiativeId);

      const metricsPayload = [
        ...completeOutcomes.map((r, idx) => ({
          client_id: clientId,
          initiative_id: savedInitiativeId,
          metric_type: "outcome_hypothesis" as const,
          metric_category: r.metric_category || null,
          metric_name: r.metric_name,
          description: r.description || null,
          baseline_value: r.baseline_value,
          baseline_unit: r.baseline_unit || null,
          target_value: r.target_value,
          target_unit: r.target_unit,
          target_date: r.target_date || null,
          measurement_method: r.measurement_method || null,
          confidence_level: r.confidence_level || null,
          linked_xmatrix_kpi_id: r.linked_xmatrix_kpi_id || null,
          is_key_result: r.is_key_result,
          update_frequency: null,
          current_value: null,
          current_value_date: null,
          alert_threshold_pct: null,
          notes: r.notes || null,
          sort_order: idx,
        })),
        ...completeIndicators.map((r, idx) => ({
          client_id: clientId,
          initiative_id: savedInitiativeId,
          metric_type: "leading_indicator" as const,
          metric_category: r.metric_category || null,
          metric_name: r.metric_name,
          description: null,
          baseline_value: null,
          baseline_unit: null,
          target_value: r.target_value,
          target_unit: r.target_unit,
          target_date: r.target_date || null,
          measurement_method: null,
          confidence_level: null,
          linked_xmatrix_kpi_id: null,
          is_key_result: false,
          update_frequency: r.update_frequency || null,
          current_value: null,
          current_value_date: null,
          alert_threshold_pct: 15,
          notes: r.notes || null,
          sort_order: idx,
        })),
      ];

      if (metricsPayload.length > 0) {
        const { error: metricsError } = await supabase
          .from("initiative_metrics")
          .insert(metricsPayload);
        if (metricsError) {
          console.error("Failed to save metrics:", metricsError);
          toast.error("Initiative saved but metrics failed to save: " + metricsError.message);
        }
      }
    };

    try {
      const stageToSave = overrideStage || init.stage;
      const alignmentScore = computeAlignmentScore();

      // Build initiative payload — only whitelisted initiative columns
      const initFields: Record<string, any> = {
        title: init.title,
        description: init.description ?? null,
        stage: stageToSave,
        strategic_alignment: alignmentScore,
        business_roi: init.business_roi ?? 1,
        planet_impact: init.planet_impact ?? 1,
        people_impact: init.people_impact ?? 1,
        people_impact_category: init.people_impact_category ?? null,
        time_to_deploy: init.time_to_deploy ?? 1,
        risk_level: init.risk_level ?? "normal",
        risk_weight: init.risk_weight ?? 1,
        lbc_decision: init.lbc_decision ?? null,
        sprint_id: init.sprint_id ?? null,
        due_date: init.due_date ?? null,
        mvp_cost: init.mvp_cost ?? null,
        estimated_deployment_cost: init.estimated_deployment_cost ?? null,
        estimated_annual_opex: init.estimated_annual_opex ?? null,
        estimated_annual_savings: init.estimated_annual_savings ?? null,
        estimated_co2_reduction: init.estimated_co2_reduction ?? null,
        financial_method: init.financial_method ?? null,
        simple_payback_years: init.simple_payback_years ?? null,
        npv: init.npv ?? null,
        discount_rate: init.discount_rate ?? null,
        estimated_mvp_months: init.estimated_mvp_months ?? null,
        estimated_deploy_months: init.estimated_deploy_months ?? null,
        impacts_business: init.impacts_business ?? false,
        impacts_environmental: init.impacts_environmental ?? false,
        impacts_people: init.impacts_people ?? false,
        priority_id: (init as any).priority_id ?? null,
      };

      // Build LBC payload — only whitelisted lean_business_cases columns
      console.log("[LBC Save] lbc state at save time:", JSON.stringify(lbc));
      const lbcFields: Record<string, any> = {
        funnel_entry_date: lbc.funnel_entry_date || (init as any).funnel_entry_date || new Date().toISOString().split("T")[0],
        initiative_owner_name: lbc.initiative_owner_name ?? null,
        key_stakeholders: lbc.key_stakeholders ?? null,
        in_scope: lbc.in_scope ?? null,
        out_of_scope: lbc.out_of_scope ?? null,
        impact_hypothesis: lbc.impact_hypothesis ?? null,
        leading_indicators: lbc.leading_indicators ?? null,
        sources_summary: lbc.sources_summary ?? null,
        customer_impact: lbc.customer_impact ?? null,
        strategic_alignments: lbc.strategic_alignments ?? null,
        value_chain_impact: lbc.value_chain_impact ?? null,
        mvp_cost_narrative: lbc.mvp_cost_narrative ?? null,
        deployment_cost_narrative: lbc.deployment_cost_narrative ?? null,
        return_estimate_narrative: lbc.return_estimate_narrative ?? null,
        development_strategy: lbc.development_strategy ?? null,
        sequencing_dependencies: lbc.sequencing_dependencies ?? null,
        risk_narrative: lbc.risk_narrative ?? null,
        mvp_features: lbc.mvp_features ?? null,
        additional_features: lbc.additional_features ?? null,
        attachments: lbc.attachments ?? null,
        other_notes: lbc.other_notes ?? null,
      };

      if (editId) {
        console.log("[LBC Save] UPDATE initiatives payload:", initFields);
        const { error: initErr } = await supabase.from("initiatives").update(initFields).eq("id", editId);
        if (initErr) {
          console.error("[LBC Save] initiatives UPDATE failed:", initErr);
          const { toast } = await import("sonner");
          toast.error("Failed to save initiative: " + initErr.message);
          setSaving(false);
          return;
        }

        if (lbc.id) {
          console.log("[LBC Save] UPDATE lean_business_cases payload:", lbcFields);
          const { error: lbcErr } = await supabase.from("lean_business_cases").update(lbcFields).eq("id", lbc.id);
          if (lbcErr) {
            console.error("[LBC Save] lean_business_cases UPDATE failed:", lbcErr);
            const { toast } = await import("sonner");
            toast.error("Failed to save LBC: " + lbcErr.message);
            setSaving(false);
            return;
          }
        } 
        else {
          console.log("[LBC Save] INSERT lean_business_cases payload (edit path):", { ...lbcFields, initiative_id: editId, client_id: clientId });
          const { data: newLbc, error: lbcErr } = await supabase.from("lean_business_cases").insert({ ...lbcFields, initiative_id: editId, client_id: clientId }).select().single();
          if (lbcErr) {
            console.error("[LBC Save] lean_business_cases INSERT failed:", lbcErr);
            const { toast } = await import("sonner");
            toast.error("Failed to create LBC: " + lbcErr.message);
            setSaving(false);
            return;
          }
          if (newLbc) {
            setLbc(newLbc as any);
            setLbcNumber((newLbc as any).lbc_number ?? null);
          }
        }

        // Update alignments
        const active = alignments.filter(a => a.strength !== "none");
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

        const { toast } = await import("sonner");
        // Auto-scoring: compute and write back scores
        const { data: wsConfig } = await supabase.from("wsjf_config").select("*").eq("client_id", clientId).maybeSingle();
        if (wsConfig) {
          const scores = computeAutoScores(wsConfig as any, { ...initFields, estimated_deploy_months: init.estimated_deploy_months ?? null });
          if (scores) {
            console.log("[LBC Save] Auto-scores computed:", scores);
            await supabase.from("initiatives").update({
              business_roi: scores.business_roi,
              planet_impact: scores.planet_impact,
              time_to_deploy: scores.time_to_deploy,
            }).eq("id", editId);
          }
        }
        await saveMetrics(editId);
        try {
          await saveFeaturesForInitiative(editId);
        } catch (featErr) {
          console.error("[LBC Save] features save failed:", featErr);
          toast.error("Initiative saved, but features could not be updated. Please try again.");
        }
        toast.success("Draft saved");
        setDirty(false);
        setSaving(false);
      } else {
        console.log("[LBC Save] INSERT initiatives payload:", { ...initFields, client_id: clientId });
        const { data: newInit, error: initErr } = await supabase
          .from("initiatives")
          .insert({ ...initFields, client_id: clientId })
          .select().single();
        if (initErr || !newInit) {
          console.error("[LBC Save] initiatives INSERT failed:", initErr);
          const { toast } = await import("sonner");
          toast.error("Failed to create initiative: " + (initErr?.message || "Unknown error"));
          setSaving(false);
          return;
        }

        console.log("[LBC Save] INSERT lean_business_cases payload:", { ...lbcFields, initiative_id: newInit.id, client_id: clientId });
        const { error: lbcErr } = await supabase
          .from("lean_business_cases")
          .insert({ ...lbcFields, initiative_id: newInit.id, client_id: clientId });
        if (lbcErr) {
          console.error("[LBC Save] lean_business_cases INSERT failed:", lbcErr);
          const { toast } = await import("sonner");
          toast.error("Failed to save LBC details: " + lbcErr.message);
          setSaving(false);
          return;
        }

        // Insert alignments
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

        // Auto-scoring on new initiative
        const { data: wsConfig2 } = await supabase.from("wsjf_config").select("*").eq("client_id", clientId).maybeSingle();
        if (wsConfig2) {
          const scores = computeAutoScores(wsConfig2 as any, { ...initFields, estimated_deploy_months: init.estimated_deploy_months ?? null });
          if (scores) {
            console.log("[LBC Save] Auto-scores computed (new):", scores);
            await supabase.from("initiatives").update({
              business_roi: scores.business_roi,
              planet_impact: scores.planet_impact,
              time_to_deploy: scores.time_to_deploy,
            }).eq("id", newInit.id);
          }
        }

        await saveMetrics(newInit.id);

        const { toast } = await import("sonner");
        try {
          await saveFeaturesForInitiative(newInit.id);
        } catch (featErr) {
          console.error("[LBC Save] features save failed:", featErr);
          toast.error("Initiative saved, but features could not be updated. Please try again.");
        }
        toast.success("Draft saved");
        setDirty(false);
        setSaving(false);
        navigate({ to: "/lbc/$id", params: { id: newInit.id } });
      }
    } catch (err: any) {
      console.error("[LBC Save] Unexpected error:", err);
      const { toast } = await import("sonner");
      toast.error("Save failed: " + (err?.message || "Unknown error"));
      setSaving(false);
    }
  }

  // Step 2e — persistent footer wrappers.
  // Status is encoded via initiative.stage:
  //   "funnel" = draft, "review" = submitted (matches existing handleSave contract).
  // Validation logic for Submit lives in Step 2f; for now Submit calls the
  // same save path as Save Draft but with overrideStage = "review".
  async function handleSaveDraft() {
    if (saving) return;
    const { toast } = await import("sonner");
    const beforeSaving = saving;
    try {
      await handleSave(); // no override -> uses current init.stage (defaults to "funnel")
      // handleSave shows its own success toast on success ("Draft saved").
      // We additionally surface the spec'd success copy:
      toast.success("Draft saved successfully");
    } catch {
      toast.error("Draft could not be saved. Please try again.");
    } finally {
      // handleSave manages setSaving internally
      void beforeSaving;
    }
  }

  async function handleSubmit() {
    if (saving) return;
    setSubmitAttempted(true);
    setAttemptedSubmit(true);
    const { toast } = await import("sonner");

    // Re-run validation against current state (closure-safe).
    const bcErrs: string[] = [];
    if (init.estimated_annual_opex == null) bcErrs.push("opex");
    if (init.estimated_annual_savings == null) bcErrs.push("savings");
    if (init.estimated_co2_reduction == null) bcErrs.push("co2");
    if (init.estimated_mvp_months == null) bcErrs.push("mvp_months");
    if (init.estimated_deploy_months == null) bcErrs.push("deploy_months");
    if (!init.risk_level) bcErrs.push("risk_level");
    if (!(init as any).people_impact_category) bcErrs.push("people_impact_category");
    if (!alignments.some(a => a.strength !== "none")) bcErrs.push("alignments");

    const ftErrs: string[] = [];
    if (!isMvpValid()) ftErrs.push("mvp");
    if (!isPostMvpValid()) ftErrs.push("post_mvp");

    const imErrs: string[] = [];
    if (!outcomeRows.some(r => r.metric_name.trim().length > 0 && r.metric_category && r.target_value !== null && r.target_unit.trim().length > 0)) imErrs.push("outcome");
    if (!leadingRows.some(r => r.metric_name.trim().length > 0 && r.metric_category && r.target_value !== null && r.target_unit.trim().length > 0)) imErrs.push("leading");

    if (bcErrs.length || ftErrs.length || imErrs.length) {
      // Navigate to first failing tab
      if (bcErrs.length) setActiveTab("business");
      else if (ftErrs.length) setActiveTab("features");
      else setActiveTab("metrics");
      toast.error("Please complete all required fields before submitting.");
      return;
    }

    try {
      await handleSave("review");
      toast.success("Initiative submitted successfully");
    } catch {
      toast.error("Submission could not be completed. Please try again.");
    }
  }

  const handlePrint = () => {
    const details = document.querySelectorAll("[data-state='closed']");
    details.forEach((el) => (el as HTMLElement).click());
    setTimeout(() => window.print(), 300);
  };

  const displayLbcNumber = lbcNumber ? `LBC-${String(lbcNumber).padStart(3, "0")}` : "New";

  const fieldProps = (disabled?: boolean) => readOnly || disabled ? { disabled: true } : {};

  // ============================================================
  // Step 2f — Submit validation
  // Validates underlying user inputs that feed the auto-scored
  // WSJF fields (no manual Fibonacci dropdowns exist in the form).
  // ============================================================
  const businessCaseErrors: { field: string; message: string }[] = [];
  if (init.estimated_annual_opex == null || isNaN(Number(init.estimated_annual_opex))) {
    businessCaseErrors.push({ field: "estimated_annual_opex", message: "Estimated Annual Operating Cost is required" });
  }
  if (init.estimated_annual_savings == null || isNaN(Number(init.estimated_annual_savings))) {
    businessCaseErrors.push({ field: "estimated_annual_savings", message: "Estimated Annual Savings / Revenue / Cost Avoidance is required" });
  }
  if (init.estimated_co2_reduction == null || isNaN(Number(init.estimated_co2_reduction))) {
    businessCaseErrors.push({ field: "estimated_co2_reduction", message: "Estimated CO2 Reduction is required" });
  }
  if (init.estimated_mvp_months == null || isNaN(Number(init.estimated_mvp_months))) {
    businessCaseErrors.push({ field: "estimated_mvp_months", message: "Estimated Time to Deploy the MVP is required" });
  }
  if (init.estimated_deploy_months == null || isNaN(Number(init.estimated_deploy_months))) {
    businessCaseErrors.push({ field: "estimated_deploy_months", message: "Estimated Time to Fully Deploy is required (drives Initiative Duration score)" });
  }
  if (!init.risk_level) {
    businessCaseErrors.push({ field: "risk_level", message: "Risk Level must be selected" });
  }
  if (!(init as any).people_impact_category) {
    businessCaseErrors.push({ field: "people_impact_category", message: "People Impact Category must be selected" });
  }
  if (!alignments.some(a => a.strength !== "none")) {
    businessCaseErrors.push({ field: "alignments", message: "At least one Strategic Objective alignment is required" });
  }

  const featuresErrors: string[] = [];
  if (!isMvpValid()) featuresErrors.push("At least one MVP feature with a title is required");
  if (!isPostMvpValid()) featuresErrors.push("At least one Post-MVP feature with a title is required");

  const isOutcomeRowComplete = (r: OutcomeHypothesisRow) =>
    r.metric_name.trim().length > 0 &&
    !!r.metric_category &&
    r.target_value !== null &&
    r.target_unit.trim().length > 0;
  const isLeadingRowComplete = (r: LeadingIndicatorRow) =>
    r.metric_name.trim().length > 0 &&
    !!r.metric_category &&
    r.target_value !== null &&
    r.target_unit.trim().length > 0;

  const impactMetricsErrors: string[] = [];
  if (!outcomeRows.some(isOutcomeRowComplete)) impactMetricsErrors.push("At least one Outcome Hypothesis is required");
  if (!leadingRows.some(isLeadingRowComplete)) impactMetricsErrors.push("At least one Leading Indicator is required");

  const businessCaseHasErrors = submitAttempted && businessCaseErrors.length > 0;
  const featuresHasErrors = submitAttempted && featuresErrors.length > 0;
  const impactMetricsHasErrors = submitAttempted && impactMetricsErrors.length > 0;

  const fieldHasError = (name: string) =>
    submitAttempted && businessCaseErrors.some(e => e.field === name);
  const fieldErrorMessage = (name: string) =>
    businessCaseErrors.find(e => e.field === name)?.message;



  return (
    <div className="max-w-3xl mx-auto lbc-form-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 lbc-form-header">
        <div className="flex items-center gap-3">
          {dirty ? (
            <Button variant="ghost" size="icon" className="print-hide" onClick={() => setShowLeaveDialog(true)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            <Link to="/lbc">
              <Button variant="ghost" size="icon" className="print-hide">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          )}
          <span
            className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium text-white shrink-0"
            style={{ backgroundColor: "#1B4F72" }}
          >
            {displayLbcNumber}
          </span>
          <Input
            value={init.title || ""}
            onChange={e => si("title", e.target.value)}
            placeholder="Enter Initiative Title"
            className="text-2xl font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0 hover:bg-muted/50 rounded transition-colors flex-1"
            {...fieldProps()}
          />
        </div>
        <Button variant="outline" size="sm" onClick={handlePrint} className="print-hide">
          <Printer className="h-4 w-4 mr-1" /> Print
        </Button>
      </div>

      {/* Print header */}
      <div className="lbc-print-header hidden">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-bold tracking-widest">PHOENIX</span>
          <span>—</span>
          <span className="font-semibold">Lean Business Case</span>
        </div>
        <div className="text-lg font-bold">{displayLbcNumber}: {init.title || "Untitled"}</div>
        <div className="text-sm text-muted-foreground mt-1">{client?.name} · {new Date().toLocaleDateString()}</div>
      </div>

      {/* Step 2f — Submit validation summary banner */}
      {submitAttempted && (businessCaseHasErrors || featuresHasErrors || impactMetricsHasErrors) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4 print-hide" role="alert">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-red-800 text-sm">
              <p className="font-semibold">Please complete all required fields before submitting.</p>
              <p className="mt-1">
                Issues found in: {[
                  businessCaseHasErrors && "Business Case",
                  featuresHasErrors && "Features",
                  impactMetricsHasErrors && "Impact Metrics",
                ].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "business" | "features" | "metrics")} className="w-full">
        <TabsList className="bg-transparent p-0 h-auto border-b border-gray-200 w-full justify-start rounded-none gap-6 mb-4 print-hide">
          <TabsTrigger
            value="business"
            className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 data-[state=active]:shadow-none px-1 pb-2 text-sm font-medium"
          >
            Business Case
            {businessCaseHasErrors && (
              <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-red-500" aria-label="Errors" />
            )}
          </TabsTrigger>
          <TabsTrigger
            value="features"
            className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 data-[state=active]:shadow-none px-1 pb-2 text-sm font-medium"
          >
            Features
            {featuresHasErrors && (
              <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-red-500" aria-label="Errors" />
            )}
          </TabsTrigger>
          <TabsTrigger
            value="metrics"
            className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 data-[state=active]:shadow-none px-1 pb-2 text-sm font-medium"
          >
            Impact Metrics
            {impactMetricsHasErrors && (
              <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-red-500" aria-label="Errors" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="mt-0 pb-24">
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
              <Hint>Use for tracking, aging, and analysis</Hint>
              <Input type="date" value={lbc.funnel_entry_date || ""} onChange={e => sl("funnel_entry_date", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 2: Initiative Owner</Label>
              <Hint>Who is the Initiative owner?</Hint>
              <Input value={lbc.initiative_owner_name || ""} onChange={e => sl("initiative_owner_name", e.target.value)} placeholder="Owner name" {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 3: Key Stakeholders</Label>
              <Hint>List the names of key stakeholders</Hint>
              <Textarea value={lbc.key_stakeholders || ""} onChange={e => sl("key_stakeholders", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">X-Matrix Improvement Priority</Label>
              <p className="text-xs text-slate-400 italic mb-1">
                If this initiative is linked to an X-Matrix Improvement Priority, select it from the list below. Otherwise select None. Multiple initiatives may be linked to the same Improvement Priority.
              </p>
              <Select
                value={(init as any).priority_id ?? "__none__"}
                onValueChange={(value) => si("priority_id", value === "__none__" ? null : value)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {priorities.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                const selectedPriority = priorities.find(p => p.id === (init as any).priority_id);
                return selectedPriority ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-teal-50 border border-teal-200 text-sm text-teal-800 mt-1">
                    <span className="font-medium">Linked Priority:</span>
                    <span>{selectedPriority.title}</span>
                  </div>
                ) : null;
              })()}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 4: Description</Label>
              <Hint>Describe the Initiative or Priority Improvement</Hint>
              <Textarea value={init.description || ""} onChange={e => si("description", e.target.value)} {...fieldProps()} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Section 2 — Problem Statement */}
        <AccordionItem value="s2" className="border rounded-lg px-4">
          <AccordionTrigger className="font-semibold text-sm text-primary">
            Section 2 — Problem Statements
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div>
              <Label className="text-xs text-muted-foreground">Box 5: Impacted Areas</Label>
              <Hint>Select all areas impacted by this Initiative</Hint>
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
              <Hint>List the items that are in scope for this Initiative</Hint>
              <Textarea value={lbc.in_scope || ""} onChange={e => sl("in_scope", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 7: Out of Scope</Label>
              <Hint>List the items that are out of scope for this Initiative</Hint>
              <Textarea value={lbc.out_of_scope || ""} onChange={e => sl("out_of_scope", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 8: Impact Outcome Hypothesis</Label>
              <Hint>Describe how the success of the Initiative will be measured: for example, a 25% decrease in the cost of HVAC, or 50% reduction in GHG emissions. Include outcome hypothesis for each Impacted Area</Hint>
              <Textarea value={lbc.impact_hypothesis || ""} onChange={e => sl("impact_hypothesis", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 9: Leading Indicators</Label>
              <Hint>Provide leading indicators of the outcomes hypothesis: for example, a 10% decrease in KWh consumed within 30 days of MVP launch</Hint>
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
            {/* Box 10 & Box 11 (MVP / Post-MVP Features) moved to the "Features" tab */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Box 10a: Estimated Time to Deploy the MVP</Label>
                <Hint>Provide an estimation of the time, in months, required to deploy the MVP</Hint>
                <Input type="number" value={init.estimated_mvp_months ?? ""} onChange={e => si("estimated_mvp_months", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
                <FieldError message={fieldHasError("estimated_mvp_months") ? fieldErrorMessage("estimated_mvp_months") : undefined} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Box 11a: Estimated Time to Fully Deploy</Label>
                <Hint>Provide an estimation of the time, in months, required to deploy the full initiative needed to realize all business outcomes</Hint>
                <Input type="number" value={init.estimated_deploy_months ?? ""} onChange={e => si("estimated_deploy_months", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
                <FieldError message={fieldHasError("estimated_deploy_months") ? fieldErrorMessage("estimated_deploy_months") : undefined} />
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
              <Hint>Brief summary of the sources for the analysis formed to create the business case</Hint>
              <Textarea value={lbc.sources_summary || ""} onChange={e => sl("sources_summary", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 14: Customer/Program Impact</Label>
              <Hint>Identify programs, services, teams, departments, facilities and so on that may be impacted by this Initiative</Hint>
              <Textarea value={lbc.customer_impact || ""} onChange={e => sl("customer_impact", e.target.value)} {...fieldProps()} />
            </div>

            {/* Box 15: Strategic Objective Alignments */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Box 15: Strategic Objective Alignments</Label>
              <Hint>Which Annual Strategic Objectives does this initiative impact and what is the strength of that relationship? Define relationships as Strong, Medium, or Weak consistent with X-Matrix</Hint>
              {alignments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No annual objectives defined yet.</p>
              ) : (
                <div className="space-y-2 border rounded-md p-3">
                  {alignments.map(a => (
                    <div key={a.objective_id} className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate flex-1">{a.objective_title}</span>
                      <Select
                        value={a.strength}
                        onValueChange={v => setAlignmentStrengthTracked(a.objective_id, v as CorrelationStrength)}
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
              <FieldError message={fieldHasError("alignments") ? fieldErrorMessage("alignments") : undefined} />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Box 16: Value Chain Impact</Label>
              <Hint>Describe the impact on the overall value chain outside of your own organization, including elements associated with the circular economy and scope 3 emissions</Hint>
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
                <Label className="text-xs text-muted-foreground">Box 18: Est. Full Deployment Costs</Label>
                <Input type="number" value={init.estimated_deployment_cost ?? ""} onChange={e => si("estimated_deployment_cost", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 17a: MVP Cost Assumptions and Calculations</Label>
              <Textarea value={(lbc as any).mvp_cost_narrative || ""} onChange={e => sl("mvp_cost_narrative", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 18a: Full Deployment Cost Assumptions and Calculations</Label>
              <Textarea value={(lbc as any).deployment_cost_narrative || ""} onChange={e => sl("deployment_cost_narrative", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 19: Estimate of Return Narrative</Label>
              <Hint>Quantify and describe the estimated return in terms of the stated Impact Outcome Hypothesis. Include assumptions and calculations used to normalize returns to current year dollars</Hint>
              <Textarea value={lbc.return_estimate_narrative || ""} onChange={e => sl("return_estimate_narrative", e.target.value)} {...fieldProps()} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Annual Operating Cost</Label>
                <Input type="number" value={init.estimated_annual_opex ?? ""} onChange={e => si("estimated_annual_opex", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
                <FieldError message={fieldHasError("estimated_annual_opex") ? fieldErrorMessage("estimated_annual_opex") : undefined} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Estimated Annual Savings/Revenue/Cost Avoidance ($)</Label>
                <Input type="number" value={init.estimated_annual_savings ?? ""} onChange={e => si("estimated_annual_savings", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
                <FieldError message={fieldHasError("estimated_annual_savings") ? fieldErrorMessage("estimated_annual_savings") : undefined} />
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
              <Label className="text-xs text-muted-foreground">Est. CO₂ Reduction (tCO₂e) — if climate emissions impact</Label>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Input type="number" value={init.estimated_co2_reduction ?? ""} onChange={e => si("estimated_co2_reduction", e.target.value ? Number(e.target.value) : null)} {...fieldProps()} />
                  <FieldError message={fieldHasError("estimated_co2_reduction") ? fieldErrorMessage("estimated_co2_reduction") : undefined} />
                </div>
                <div className="pb-2 min-w-[140px]">
                  <Label className="text-xs text-muted-foreground">% of Baseline</Label>
                  {baselineTotalCo2e != null && baselineTotalCo2e > 0 ? (
                    <span className="block text-sm font-medium">
                      {init.estimated_co2_reduction != null
                        ? ((init.estimated_co2_reduction / baselineTotalCo2e) * 100).toFixed(1) + "%"
                        : "—"}
                    </span>
                  ) : (
                    <span className="block text-sm text-muted-foreground italic">Baseline not configured in Settings</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">People Impact — if applicable (use Scoring Rubric)</Label>
              <Hint>Select the category that best reflects the impact on people, patients, staff, and community. Refer to the Scoring Rubric for detailed criteria and examples</Hint>
              <Select
                value={
                  init.people_impact != null && (init as any).people_impact_category
                    ? `${init.people_impact}_${(init as any).people_impact_category}`
                    : "__unassigned__"
                }
                onValueChange={v => {
                  if (v === "__unassigned__") {
                    si("people_impact", null);
                    si("people_impact_category", null);
                  } else {
                    const [score, ...catParts] = v.split("_");
                    si("people_impact", Number(score));
                    si("people_impact_category", catParts.join("_"));
                  }
                }}
                disabled={readOnly}
              >
                <SelectTrigger><SelectValue placeholder="Select people impact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">— Select —</SelectItem>
                  <SelectItem value="1_negligible">Negligible (1)</SelectItem>
                  <SelectItem value="2_minimal">Minimal (2)</SelectItem>
                  <SelectItem value="3_low">Low (3)</SelectItem>
                  <SelectItem value="5_moderate">Moderate (5)</SelectItem>
                  <SelectItem value="8_significant">Significant (8)</SelectItem>
                  <SelectItem value="10_high">High (10)</SelectItem>
                  <SelectItem value="13_exceptional">Exceptional (13)</SelectItem>
                </SelectContent>
              </Select>
              <FieldError message={fieldHasError("people_impact_category") ? fieldErrorMessage("people_impact_category") : undefined} />
            </div>

            {scoringRubricUrl ? (
              <a href={scoringRubricUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline hover:opacity-80">
                View Scoring Rubric
              </a>
            ) : (
              <p className="text-sm text-muted-foreground italic">No scoring rubric configured — contact your administrator</p>
            )}
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
              <Hint>Indicate if initiative would be developed in-house or require outside support or development</Hint>
              <Textarea value={lbc.development_strategy || ""} onChange={e => sl("development_strategy", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 21: Sequencing & Dependencies</Label>
              <Hint>Describe any constraints for sequencing the Initiative and identify any potential dependencies with other Initiatives or solutions</Hint>
              <Textarea value={lbc.sequencing_dependencies || ""} onChange={e => sl("sequencing_dependencies", e.target.value)} {...fieldProps()} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Box 22: Risk Level</Label>
              <Hint>Select the category that best reflects the risks and/or uncertainties in outcomes achievement. Consider internal capabilities and resources, supply chain capabilities and resources, and risks/uncertainties associated with planned technology and methods</Hint>
              <Select value={init.risk_level || "normal"} onValueChange={handleRiskChange} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
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
              <Hint>Other supporting documentation, links to other data, feasibility or trade studies, models, market analysis</Hint>
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
              <Hint>Any additional miscellaneous information relevant to LPM</Hint>
              <Textarea value={lbc.other_notes || ""} onChange={e => sl("other_notes", e.target.value)} {...fieldProps()} />
            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>
        </TabsContent>

        {/* === TAB 2 — Features === */}
        <TabsContent value="features" className="mt-0 pb-24 space-y-6">
            {/* Box 10 — MVP Features (structured rows) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-muted-foreground font-semibold" style={{ color: "#1B4F72" }}>
                  Box 10 — MVP Features
                </Label>
                {(() => {
                  const titledCount = mvpRows.filter(r => r.title.trim().length > 0).length;
                  const isPositive = titledCount > 0;
                  return (
                    <span
                      className="inline-flex items-center justify-center min-w-[1.5rem] px-2 h-5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: isPositive ? "#0E7A65" : "#E5E7EB",
                        color: isPositive ? "#FFFFFF" : "#6B7280",
                      }}
                    >
                      {titledCount}
                    </span>
                  );
                })()}
              </div>

              {/* Narrative summary (existing free-text column, relabelled only) */}
              <Label className="text-xs text-muted-foreground">
                MVP Features Summary (stakeholder narrative)
              </Label>
              <Textarea
                value={lbc.mvp_features || ""}
                onChange={e => sl("mvp_features", e.target.value)}
                placeholder="Summarise the MVP feature set for non-technical stakeholders and sponsors..."
                {...fieldProps()}
              />

              <p className="text-sm text-gray-500 italic mt-2">
                What are the minimum Features that must be delivered to evaluate if the
                final product will be successful from the customer and/or business
                perspective? These Features constitute the Minimal Viable Product and
                allow us to learn, and if necessary pivot, before committing the resources
                for full deployment.
              </p>

              {attemptedSubmit && !isMvpValid() && (
                <div className="flex items-center gap-1.5 text-red-600 text-sm mt-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>At least one MVP feature with a title is required.</span>
                </div>
              )}

              <div className="mt-3">
                {featuresLoading ? (
                  <>
                    <div className="bg-gray-100 rounded-md h-16 mb-2 animate-pulse" />
                    <div className="bg-gray-100 rounded-md h-16 mb-2 animate-pulse" />
                  </>
                ) : (
                  mvpRows.map((row, idx) => {
                    const trimmed = row.title.trim();
                    const showTitleWarning = trimmed.length > 0 && trimmed.length < 5;
                    return (
                      <div
                        key={row.id ?? `new-mvp-${idx}`}
                        className="bg-white rounded-md border border-gray-200 shadow-sm p-3 mb-2 hover:border-teal-300 transition-colors flex flex-col md:flex-row gap-3"
                      >
                        <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center flex-shrink-0 self-start mt-1">
                          {idx + 1}
                        </div>

                        <div className="flex-grow space-y-2 min-w-0">
                          <div>
                            <Label className="text-xs text-muted-foreground">Feature Title *</Label>
                            <Input
                              value={row.title}
                              onChange={e => {
                                const v = e.target.value;
                                setMvpRows(prev => prev.map((r, i) => i === idx ? { ...r, title: v } : r));
                              }}
                              placeholder="Feature title"
                              {...fieldProps()}
                            />
                            {showTitleWarning && (
                              <p className="text-amber-600 text-xs mt-1">
                                Title should be at least 5 characters
                              </p>
                            )}
                          </div>

                          <div>
                            <Label className="text-xs text-muted-foreground">Acceptance Criteria</Label>
                            <Textarea
                              value={row.acceptance_criteria}
                              onChange={e => {
                                const v = e.target.value;
                                setMvpRows(prev => prev.map((r, i) => i === idx ? { ...r, acceptance_criteria: v } : r));
                              }}
                              placeholder="List key acceptance criteria that the Feature must meet. Note these will be used to accept or reject Feature completion prior to deployment."
                              rows={2}
                              onFocus={e => { e.currentTarget.rows = 4; }}
                              onBlur={e => { e.currentTarget.rows = 2; }}
                              className="transition-all"
                              {...fieldProps()}
                            />
                          </div>
                        </div>

                        <div className="w-full md:w-36 flex-shrink-0">
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Select
                            value={row.status}
                            onValueChange={(v) => {
                              setMvpRows(prev => prev.map((r, i) => i === idx ? { ...r, status: v as FeatureStatus } : r));
                            }}
                            disabled={readOnly}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="backlog">Backlog</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {mvpRows.length > 1 && !readOnly && (
                          <button
                            type="button"
                            onClick={() => setDeleteFeatureIdx(idx)}
                            className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0 self-start mt-1"
                            aria-label="Remove MVP feature"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}

                {!featuresLoading && !readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMvpRows(prev => [
                        ...prev,
                        createBlankFeatureRow("mvp", prev.length),
                      ]);
                    }}
                    className="w-full border-teal-600 text-teal-700 hover:bg-teal-50"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add MVP Feature
                  </Button>
                )}
              </div>
            </div>

            {/* Box 11 — Post-MVP Features (structured rows) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-muted-foreground font-semibold" style={{ color: "#1B4F72" }}>
                  Box 11 — Post-MVP Features
                </Label>
                {(() => {
                  const titledCount = postMvpRows.filter(r => r.title.trim().length > 0).length;
                  const isPositive = titledCount > 0;
                  return (
                    <span
                      className="inline-flex items-center justify-center min-w-[1.5rem] px-2 h-5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: isPositive ? "#0E7A65" : "#E5E7EB",
                        color: isPositive ? "#FFFFFF" : "#6B7280",
                      }}
                    >
                      {titledCount}
                    </span>
                  );
                })()}
              </div>

              {/* Narrative summary (existing free-text column, relabelled only) */}
              <Label className="text-xs text-muted-foreground">
                Post-MVP Features Summary (stakeholder narrative)
              </Label>
              <Textarea
                value={lbc.additional_features || ""}
                onChange={e => sl("additional_features", e.target.value)}
                placeholder="Summarise the post-MVP roadmap for sponsors and the steering committee..."
                {...fieldProps()}
              />

              <p className="text-sm text-gray-500 italic mt-2">
                What capabilities/features are needed to complete the project beyond the
                MVP? Together the MVP and the Post-MVP Features make up the initial
                project scope and serve as the basis for the Outcome Impact Hypothesis
                and other impacts, costs, returns and calculations detailed in this LBC.
              </p>

              {attemptedSubmit && !isPostMvpValid() && (
                <div className="flex items-center gap-1.5 text-red-600 text-sm mt-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>At least one Post-MVP feature with a title is required.</span>
                </div>
              )}

              <div className="mt-3">
                {featuresLoading ? (
                  <>
                    <div className="bg-gray-100 rounded-md h-16 mb-2 animate-pulse" />
                    <div className="bg-gray-100 rounded-md h-16 mb-2 animate-pulse" />
                  </>
                ) : (
                  postMvpRows.map((row, idx) => {
                    const trimmed = row.title.trim();
                    const showTitleWarning = trimmed.length > 0 && trimmed.length < 5;
                    return (
                      <div
                        key={row.id ?? `new-postmvp-${idx}`}
                        className="bg-white rounded-md border border-gray-200 shadow-sm p-3 mb-2 hover:border-teal-300 transition-colors flex flex-col md:flex-row gap-3"
                      >
                        <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center flex-shrink-0 self-start mt-1">
                          {idx + 1}
                        </div>

                        <div className="flex-grow space-y-2 min-w-0">
                          <div>
                            <Label className="text-xs text-muted-foreground">Feature Title *</Label>
                            <Input
                              value={row.title}
                              onChange={e => {
                                const v = e.target.value;
                                setPostMvpRows(prev => prev.map((r, i) => i === idx ? { ...r, title: v } : r));
                              }}
                              placeholder="Feature title"
                              {...fieldProps()}
                            />
                            {showTitleWarning && (
                              <p className="text-amber-600 text-xs mt-1">
                                Title should be at least 5 characters
                              </p>
                            )}
                          </div>

                          <div>
                            <Label className="text-xs text-muted-foreground">Acceptance Criteria</Label>
                            <Textarea
                              value={row.acceptance_criteria}
                              onChange={e => {
                                const v = e.target.value;
                                setPostMvpRows(prev => prev.map((r, i) => i === idx ? { ...r, acceptance_criteria: v } : r));
                              }}
                              placeholder="List key acceptance criteria that the Feature must meet. Note these will be used to accept or reject Feature completion prior to deployment."
                              rows={2}
                              onFocus={e => { e.currentTarget.rows = 4; }}
                              onBlur={e => { e.currentTarget.rows = 2; }}
                              className="transition-all"
                              {...fieldProps()}
                            />
                          </div>
                        </div>

                        <div className="w-full md:w-36 flex-shrink-0">
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Select
                            value={row.status}
                            onValueChange={(v) => {
                              setPostMvpRows(prev => prev.map((r, i) => i === idx ? { ...r, status: v as FeatureStatus } : r));
                            }}
                            disabled={readOnly}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="backlog">Backlog</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {postMvpRows.length > 1 && !readOnly && (
                          <button
                            type="button"
                            onClick={() => setDeletePostMvpFeatureIdx(idx)}
                            className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0 self-start mt-1"
                            aria-label="Remove Post-MVP feature"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}

                {!featuresLoading && !readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPostMvpRows(prev => [
                        ...prev,
                        createBlankFeatureRow("post_mvp", prev.length),
                      ]);
                    }}
                    className="w-full border-teal-600 text-teal-700 hover:bg-teal-50"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Post-MVP Feature
                  </Button>
                )}
              </div>
            </div>
        </TabsContent>

        {/* === TAB 3 — Impact Metrics === */}
        <TabsContent value="metrics" className="mt-0 pb-24 space-y-6">
          <OutcomeHypothesisSection
            initiativeId={editId ?? null}
            priorityId={(init as any).priority_id ?? null}
            clientId={clientId || ""}
            rows={outcomeRows}
            onChange={setOutcomeRows}
          />
          <LeadingIndicatorSection
            initiativeId={editId ?? null}
            clientId={clientId || ""}
            rows={leadingRows}
            onChange={setLeadingRows}
          />
        </TabsContent>
      </Tabs>

      {/* Persistent footer — always visible regardless of active tab.
          Status mapping: Save Draft -> initiative.stage = "funnel" (draft),
          Submit -> initiative.stage = "review" (submitted).
          Validation logic for Submit is added in Step 2f. */}
      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 print-hide z-20">
          <div className="max-w-3xl mx-auto flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => handleSaveDraft()}
              disabled={saving || !init.title}
              style={{ borderColor: "#1B4F72", color: "#1B4F72" }}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Draft
            </Button>
            <Button
              onClick={() => handleSubmit()}
              disabled={saving || !init.title}
              style={{ backgroundColor: "#1B4F72", color: "#FFFFFF" }}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Submit
            </Button>
          </div>
        </div>
      )}

      {/* Leave confirmation */}
      <ConfirmDialog
        open={showLeaveDialog}
        onCancel={() => setShowLeaveDialog(false)}
        onConfirm={() => { setShowLeaveDialog(false); navigate({ to: "/lbc" }); }}
        title="Unsaved changes"
        description="You have unsaved changes. Leave without saving?"
        confirmLabel="Leave"
      />

      {/* Submit confirmation */}
      <ConfirmDialog
        open={showSubmitDialog}
        onCancel={() => setShowSubmitDialog(false)}
        onConfirm={() => { setShowSubmitDialog(false); handleSave("review"); }}
        title="Submit for Review"
        description="Submit this LBC for PMO review? The initiative will move to the Review stage."
        confirmLabel="Submit"
        variant="default"
      />

      {/* Remove MVP Feature confirmation */}
      <ConfirmDialog
        open={deleteFeatureIdx !== null}
        onCancel={() => setDeleteFeatureIdx(null)}
        onConfirm={() => {
          if (deleteFeatureIdx !== null) {
            const idx = deleteFeatureIdx;
            setMvpRows(prev => prev.filter((_, i) => i !== idx));
          }
          setDeleteFeatureIdx(null);
        }}
        title="Remove MVP Feature"
        description="Remove this MVP feature row? This cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
      />

      {/* Remove Post-MVP Feature confirmation */}
      <ConfirmDialog
        open={deletePostMvpFeatureIdx !== null}
        onCancel={() => setDeletePostMvpFeatureIdx(null)}
        onConfirm={() => {
          if (deletePostMvpFeatureIdx !== null) {
            const idx = deletePostMvpFeatureIdx;
            setPostMvpRows(prev => prev.filter((_, i) => i !== idx));
          }
          setDeletePostMvpFeatureIdx(null);
        }}
        title="Remove Post-MVP Feature"
        description="Remove this Post-MVP feature row? This cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
      />
    </div>
  );
}
