import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings, Calculator, Columns3, CalendarDays, Users, Building2, Plus, Pencil, Trash2, Save, ExternalLink } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { RiskLevel, Sprint, SprintStatus, Profile, UserRole } from "@/types/database";

/* ── helpers ── */
const RISK_LEVELS: { key: RiskLevel; label: string }[] = [
  { key: "very_high", label: "Very High" },
  { key: "high", label: "High" },
  { key: "normal", label: "Normal" },
  { key: "low", label: "Low" },
];

const STRENGTH_KEYS = ["strong", "medium", "weak"] as const;
const STRENGTH_LABELS: Record<string, string> = { strong: "Strong", medium: "Medium", weak: "Weak" };

const WIP_STAGES = [
  { stage: "funnel", label: "Funnel", hasLimit: false },
  { stage: "review", label: "Review", hasLimit: false },
  { stage: "analysis", label: "Analysis", hasLimit: true },
  { stage: "ready", label: "Ready", hasLimit: true },
  { stage: "in_delivery", label: "In Delivery", hasLimit: true },
  { stage: "deployed", label: "Deployed", hasLimit: false },
  { stage: "closed", label: "Closed", hasLimit: false },
  { stage: "archive", label: "Archive", hasLimit: false },
] as const;

const DEFAULT_RISK_WEIGHTS: Record<RiskLevel, number> = {
  very_high: 0.5, high: 0.75, normal: 1.0, low: 1.25,
};
const DEFAULT_ALIGNMENT_POINTS: Record<string, number> = { strong: 5, medium: 3, weak: 1 };
const DEFAULT_ALIGNMENT_CAP = 13;

/* ================================================================ */
export default function SettingsPage() {
  const { role, clientId, session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading settings…</p>
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">Settings</h1>
      <Tabs defaultValue="wsjf" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="wsjf" className="flex items-center gap-1.5"><Calculator className="h-4 w-4" />WSJF</TabsTrigger>
          <TabsTrigger value="kanban" className="flex items-center gap-1.5"><Columns3 className="h-4 w-4" />Kanban</TabsTrigger>
          <TabsTrigger value="sprints" className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />Sprints</TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5"><Users className="h-4 w-4" />Users</TabsTrigger>
          <TabsTrigger value="client" className="flex items-center gap-1.5"><Building2 className="h-4 w-4" />Client</TabsTrigger>
        </TabsList>

        <TabsContent value="wsjf"><WSJFConfigSection clientId={clientId} authReady={!!session} /></TabsContent>
        <TabsContent value="kanban"><KanbanWIPSection clientId={clientId} /></TabsContent>
        <TabsContent value="sprints"><SprintSection clientId={clientId} /></TabsContent>
        <TabsContent value="users"><UserSection clientId={clientId} /></TabsContent>
        <TabsContent value="client"><ClientSection clientId={clientId} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────── 1. WSJF Configuration ───────── */
/* ── Scoring Engine types ── */
type ScoringMode = "manual" | "auto" | "hybrid";
type BizCriterion = "annual_savings" | "simple_payback";
type PlanetCriterion = "absolute_co2e" | "pct_baseline";

interface ThresholdRow { score: number; min: string; max: string; }

const FIB_SCORES = [1, 2, 3, 5, 8, 10, 13];

const DEFAULT_SAVINGS_THRESHOLDS: ThresholdRow[] = [
  { score: 1, min: "", max: "50000" },
  { score: 2, min: "50000", max: "150000" },
  { score: 3, min: "150000", max: "400000" },
  { score: 5, min: "400000", max: "800000" },
  { score: 8, min: "800000", max: "1500000" },
  { score: 10, min: "1500000", max: "3000000" },
  { score: 13, min: "3000000", max: "" },
];

const DEFAULT_PAYBACK_THRESHOLDS: ThresholdRow[] = [
  { score: 13, min: "", max: "1" },
  { score: 10, min: "1", max: "2" },
  { score: 8, min: "2", max: "4" },
  { score: 5, min: "4", max: "7" },
  { score: 3, min: "7", max: "10" },
  { score: 2, min: "10", max: "15" },
  { score: 1, min: "15", max: "" },
];

const DEFAULT_CO2E_THRESHOLDS: ThresholdRow[] = [
  { score: 1, min: "", max: "100" },
  { score: 2, min: "100", max: "500" },
  { score: 3, min: "500", max: "1500" },
  { score: 5, min: "1500", max: "5000" },
  { score: 8, min: "5000", max: "15000" },
  { score: 10, min: "15000", max: "50000" },
  { score: 13, min: "50000", max: "" },
];

const DEFAULT_PCT_BASELINE_THRESHOLDS: ThresholdRow[] = [
  { score: 1, min: "", max: "1" },
  { score: 2, min: "1", max: "3" },
  { score: 3, min: "3", max: "5" },
  { score: 5, min: "5", max: "10" },
  { score: 8, min: "10", max: "20" },
  { score: 10, min: "20", max: "40" },
  { score: 13, min: "40", max: "" },
];

const DEFAULT_DURATION_THRESHOLDS: ThresholdRow[] = [
  { score: 13, min: "", max: "2" },
  { score: 10, min: "2", max: "4" },
  { score: 8, min: "4", max: "6" },
  { score: 5, min: "6", max: "12" },
  { score: 3, min: "12", max: "18" },
  { score: 2, min: "18", max: "24" },
  { score: 1, min: "24", max: "" },
];

function ThresholdTable({ label, rows, onChange, unit, note }: {
  label: string; rows: ThresholdRow[]; onChange: (rows: ThresholdRow[]) => void; unit: string; note?: string;
}) {
  const update = (idx: number, field: "min" | "max", val: string) => {
    const next = rows.map((r, i) => i === idx ? { ...r, [field]: val } : r);
    onChange(next);
  };
  return (
    <div className="mt-3">
      <Label className="text-xs font-medium">{label}</Label>
      <Table className="mt-1">
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Score</TableHead>
            <TableHead>Min ({unit})</TableHead>
            <TableHead>Max ({unit})</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.score}>
              <TableCell className="font-mono font-medium">{r.score}</TableCell>
              <TableCell>
                {r.min === "" ? <span className="text-muted-foreground text-xs">—</span> : (
                  <Input className="h-8 w-32" value={r.min} onChange={e => update(i, "min", e.target.value)} />
                )}
              </TableCell>
              <TableCell>
                {r.max === "" ? <span className="text-muted-foreground text-xs">—</span> : (
                  <Input className="h-8 w-32" value={r.max} onChange={e => update(i, "max", e.target.value)} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {note && <p className="text-xs text-muted-foreground italic mt-1">{note}</p>}
    </div>
  );
}

/* ── Threshold format converters ── */
// DB stores thresholds as Record<string, {min?, max?}>, UI uses ThresholdRow[]
function thresholdsToRows(obj: Record<string, { min?: string | number; max?: string | number }> | null | undefined, defaults: ThresholdRow[]): ThresholdRow[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    // If it's already an array (legacy), try to use it directly
    if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === "object" && "score" in obj[0]) {
      return obj as ThresholdRow[];
    }
    return defaults;
  }
  return FIB_SCORES.map(score => {
    const entry = obj[String(score)];
    return {
      score,
      min: entry?.min != null ? String(entry.min) : "",
      max: entry?.max != null ? String(entry.max) : "",
    };
  });
}

function rowsToThresholds(rows: ThresholdRow[]): Record<string, { min?: string; max?: string }> {
  const obj: Record<string, { min?: string; max?: string }> = {};
  for (const r of rows) {
    obj[String(r.score)] = { min: r.min, max: r.max };
  }
  return obj;
}

function createDefaultWsjfConfig(clientId: string) {
  return {
    client_id: clientId,
    risk_weights: { ...DEFAULT_RISK_WEIGHTS },
    risk_level: "normal" as RiskLevel,
    risk_weight: 1.0,
    alignment_points: { ...DEFAULT_ALIGNMENT_POINTS },
    alignment_cap: DEFAULT_ALIGNMENT_CAP,
    scoring_mode: "manual" as ScoringMode,
    business_impact_criterion: "annual_savings" as BizCriterion,
    business_impact_thresholds: rowsToThresholds(DEFAULT_SAVINGS_THRESHOLDS),
    payback_thresholds: rowsToThresholds(DEFAULT_PAYBACK_THRESHOLDS),
    planet_impact_criterion: "absolute_co2e" as PlanetCriterion,
    baseline_total_co2e: null,
    planet_impact_thresholds: rowsToThresholds(DEFAULT_CO2E_THRESHOLDS),
    pct_baseline_thresholds: rowsToThresholds(DEFAULT_PCT_BASELINE_THRESHOLDS),
    duration_thresholds: rowsToThresholds(DEFAULT_DURATION_THRESHOLDS),
    scoring_rubric_url: null,
  };
}

function WSJFConfigSection({ clientId, authReady }: { clientId: string | null; authReady: boolean }) {
  const [riskWeights, setRiskWeights] = useState<Record<RiskLevel, number>>({ ...DEFAULT_RISK_WEIGHTS });
  const [alignmentPoints, setAlignmentPoints] = useState<Record<string, number>>({ ...DEFAULT_ALIGNMENT_POINTS });
  const [alignmentCap, setAlignmentCap] = useState(DEFAULT_ALIGNMENT_CAP);

  // Scoring engine state
  const [scoringMode, setScoringMode] = useState<ScoringMode>("manual");
  const [bizCriterion, setBizCriterion] = useState<BizCriterion>("annual_savings");
  const [savingsThresholds, setSavingsThresholds] = useState<ThresholdRow[]>(DEFAULT_SAVINGS_THRESHOLDS);
  const [paybackThresholds, setPaybackThresholds] = useState<ThresholdRow[]>(DEFAULT_PAYBACK_THRESHOLDS);
  const [planetCriterion, setPlanetCriterion] = useState<PlanetCriterion>("absolute_co2e");
  const [baselineCo2e, setBaselineCo2e] = useState<string>("");
  const [co2eThresholds, setCo2eThresholds] = useState<ThresholdRow[]>(DEFAULT_CO2E_THRESHOLDS);
  const [pctBaselineThresholds, setPctBaselineThresholds] = useState<ThresholdRow[]>(DEFAULT_PCT_BASELINE_THRESHOLDS);
  const [durationThresholds, setDurationThresholds] = useState<ThresholdRow[]>(DEFAULT_DURATION_THRESHOLDS);
  const [scoringRubricUrl, setScoringRubricUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const applyConfigRow = useCallback((row: any) => {
    setRiskWeights(row.risk_weights as Record<RiskLevel, number>);
    setAlignmentPoints(row.alignment_points as Record<string, number>);
    setAlignmentCap(row.alignment_cap as number);
    setScoringMode(row.scoring_mode as ScoringMode);
    setBizCriterion(row.business_impact_criterion as BizCriterion);
    setSavingsThresholds(thresholdsToRows(row.business_impact_thresholds, DEFAULT_SAVINGS_THRESHOLDS));
    setPaybackThresholds(thresholdsToRows(row.payback_thresholds, DEFAULT_PAYBACK_THRESHOLDS));
    setPlanetCriterion(row.planet_impact_criterion as PlanetCriterion);
    setBaselineCo2e(row.baseline_total_co2e != null ? String(row.baseline_total_co2e) : "");
    setCo2eThresholds(thresholdsToRows(row.planet_impact_thresholds, DEFAULT_CO2E_THRESHOLDS));
    setPctBaselineThresholds(thresholdsToRows(row.pct_baseline_thresholds, DEFAULT_PCT_BASELINE_THRESHOLDS));
    setDurationThresholds(thresholdsToRows(row.duration_thresholds, DEFAULT_DURATION_THRESHOLDS));
    setScoringRubricUrl(row.scoring_rubric_url ?? "");
  }, []);

  const loadConfig = useCallback(async () => {
    if (!clientId || !authReady) return;

    const { data: session } = await supabase.auth.getSession();
    console.log("[Settings] Session before config load:", session?.session?.user?.id);

    if (!session?.session?.user?.id) {
      console.warn("[Settings] Supabase session not ready. Skipping config load.");
      return;
    }

    const { data, error } = await supabase
      .from("wsjf_config")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    console.log("[Settings] wsjf_config loaded:", JSON.stringify(data));

    if (error) {
      console.error("[Settings] wsjf_config fetch error:", error);
      setLoaded(true);
      return;
    }

    if (!data) {
      console.log("[Settings] No wsjf_config found, creating default");
      const { data: insertedRow, error: insertErr } = await supabase
        .from("wsjf_config")
        .insert(createDefaultWsjfConfig(clientId))
        .select("*")
        .single();

      if (insertErr) {
        console.error("[Settings] wsjf_config insert error:", insertErr);
        setLoaded(true);
        return;
      }

      console.log("[Settings] wsjf_config created:", JSON.stringify(insertedRow));
      applyConfigRow(insertedRow);
      setLoaded(true);
      return;
    }

    applyConfigRow(data as any);
    setLoaded(true);
  }, [applyConfigRow, authReady, clientId]);

  useEffect(() => {
    if (!clientId || !authReady) return;

    setLoaded(false);
    void loadConfig();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        void loadConfig();
      }
    });

    return () => subscription.unsubscribe();
  }, [authReady, clientId, loadConfig]);

  const handleSave = async () => {
    if (!clientId || saving) return;
    setSaving(true);
    try {
      const payload = {
        risk_weights: { ...riskWeights },
        alignment_points: { ...alignmentPoints },
        alignment_cap: alignmentCap,
        scoring_mode: scoringMode,
        business_impact_criterion: bizCriterion,
        business_impact_thresholds: rowsToThresholds(savingsThresholds),
        payback_thresholds: rowsToThresholds(paybackThresholds),
        planet_impact_criterion: planetCriterion,
        baseline_total_co2e: baselineCo2e ? Number(baselineCo2e) : null,
        planet_impact_thresholds: rowsToThresholds(co2eThresholds),
        pct_baseline_thresholds: rowsToThresholds(pctBaselineThresholds),
        duration_thresholds: rowsToThresholds(durationThresholds),
        scoring_rubric_url: scoringRubricUrl || null,
      };

      const { error } = await supabase
        .from("wsjf_config")
        .update(payload)
        .eq("client_id", clientId);

      if (error) {
        console.error("[Settings] wsjf_config save error:", error);
        toast.error("Failed to save WSJF configuration");
        return;
      }

      toast.success("WSJF configuration saved");
    } catch (e) {
      console.error("[Settings] save exception:", e);
      toast.error("Failed to save WSJF configuration");
    } finally {
      setSaving(false);
    }
  };
  if (!loaded) return <p className="text-muted-foreground p-4">Loading…</p>;

  return (
    <div className="space-y-6 mt-4">
      {/* Risk Weight Multipliers */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Weight Multipliers</CardTitle>
          <CardDescription>Adjust how risk level affects the final WSJF score.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {RISK_LEVELS.map((rl) => (
            <div key={rl.key}>
              <Label>{rl.label}</Label>
              <Input
                type="number" step="0.05" min="0"
                value={riskWeights[rl.key]}
                onChange={(e) => setRiskWeights((p) => ({ ...p, [rl.key]: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Strategic Alignment Points */}
      <Card>
        <CardHeader>
          <CardTitle>Strategic Alignment Points</CardTitle>
          <CardDescription>Points awarded per alignment strength when computing strategic alignment score.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          {STRENGTH_KEYS.map((s) => (
            <div key={s}>
              <Label>{STRENGTH_LABELS[s]}</Label>
              <Input
                type="number" min="0"
                value={alignmentPoints[s] ?? 0}
                onChange={(e) => setAlignmentPoints((p) => ({ ...p, [s]: parseInt(e.target.value) || 0 }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Alignment Cap */}
      <Card>
        <CardHeader>
          <CardTitle>Alignment Cap</CardTitle>
          <CardDescription>Maximum strategic alignment score (capped to this Fibonacci value).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Input
              type="number" min="1"
              value={alignmentCap}
              onChange={(e) => setAlignmentCap(parseInt(e.target.value) || 13)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Scoring Engine ── */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup value={scoringMode} onValueChange={v => setScoringMode(v as ScoringMode)} className="space-y-2">
            <div className="flex items-start gap-2">
              <RadioGroupItem value="manual" id="sm-manual" className="mt-0.5" />
              <div><Label htmlFor="sm-manual" className="font-medium">Manual</Label><p className="text-xs text-muted-foreground">Scores set manually via WSJF page dropdowns</p></div>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="auto" id="sm-auto" className="mt-0.5" />
              <div><Label htmlFor="sm-auto" className="font-medium">Auto</Label><p className="text-xs text-muted-foreground">Scores auto-computed from LBC data</p></div>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="hybrid" id="sm-hybrid" className="mt-0.5" />
              <div><Label htmlFor="sm-hybrid" className="font-medium">Hybrid</Label><p className="text-xs text-muted-foreground">Scores auto-suggested, user confirms or adjusts</p></div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Business Impact Scoring */}
      <Card>
        <CardHeader>
          <CardTitle>Business Impact Scoring</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Score based on:</Label>
            <RadioGroup value={bizCriterion} onValueChange={v => setBizCriterion(v as BizCriterion)} className="flex gap-4 mt-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="annual_savings" id="biz-savings" />
                <Label htmlFor="biz-savings" className="text-sm">Annual Savings ($)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="simple_payback" id="biz-payback" />
                <Label htmlFor="biz-payback" className="text-sm">Simple Payback (years)</Label>
              </div>
            </RadioGroup>
          </div>
          {bizCriterion === "annual_savings" ? (
            <ThresholdTable label="Annual Savings Thresholds" rows={savingsThresholds} onChange={setSavingsThresholds} unit="$" />
          ) : (
            <ThresholdTable label="Payback Period Thresholds" rows={paybackThresholds} onChange={setPaybackThresholds} unit="years" note="Lower payback = higher score" />
          )}
        </CardContent>
      </Card>

      {/* Planet Impact Scoring */}
      <Card>
        <CardHeader>
          <CardTitle>Planet Impact Scoring</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Score based on:</Label>
            <RadioGroup value={planetCriterion} onValueChange={v => setPlanetCriterion(v as PlanetCriterion)} className="flex gap-4 mt-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="absolute_co2e" id="planet-abs" />
                <Label htmlFor="planet-abs" className="text-sm">Absolute CO₂e (tCO₂e)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pct_baseline" id="planet-pct" />
                <Label htmlFor="planet-pct" className="text-sm">% of Baseline</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="max-w-sm">
            <Label>Total Baseline Emissions (tCO₂e)</Label>
            <p className="text-xs text-muted-foreground italic mb-1">Enter your organization's total Scope 1+2 baseline emissions. Used to calculate % of baseline in the LBC form and for percentage-based scoring.</p>
            <Input type="number" value={baselineCo2e} onChange={e => setBaselineCo2e(e.target.value)} placeholder="e.g. 25000" />
          </div>
          {planetCriterion === "absolute_co2e" ? (
            <ThresholdTable label="CO₂e Reduction Thresholds" rows={co2eThresholds} onChange={setCo2eThresholds} unit="tCO₂e" />
          ) : (
            <ThresholdTable label="% of Baseline Thresholds" rows={pctBaselineThresholds} onChange={setPctBaselineThresholds} unit="%" />
          )}
        </CardContent>
      </Card>

      {/* Duration Scoring */}
      <Card>
        <CardHeader>
          <CardTitle>Initiative Duration Scoring</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground italic mb-3">Duration is based on estimated full deployment time (Box 11a in the LBC), not MVP time.</p>
          <ThresholdTable label="Deployment Duration Thresholds" rows={durationThresholds} onChange={setDurationThresholds} unit="months" />
        </CardContent>
      </Card>

      {/* Scoring Rubric */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring Rubric Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-w-lg">
          <Label>Rubric URL</Label>
          <p className="text-xs text-muted-foreground italic">Paste a link to your industry-specific scoring rubric document. This link will be shown on the LBC form to guide People Impact scoring.</p>
          <Input value={scoringRubricUrl} onChange={e => setScoringRubricUrl(e.target.value)} placeholder="https://..." />
          {scoringRubricUrl && (
            <a href={scoringRubricUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">
              <ExternalLink className="h-3 w-3" />Preview link
            </a>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-[hsl(160,80%,27%)] hover:bg-[hsl(160,80%,22%)] text-white">
          <Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save WSJF Configuration"}
        </Button>
      </div>
    </div>
  );
}

/* ───────── 2. Kanban WIP Limits ───────── */
function KanbanWIPSection({ clientId }: { clientId: string | null }) {
  const [wipLimits, setWipLimits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const { data } = await supabase
        .from("kanban_wip_limits")
        .select("*")
        .eq("client_id", clientId);
      const map: Record<string, number> = {};
      if (data) data.forEach((r: any) => { map[r.stage] = r.wip_limit; });
      setWipLimits(map);
      setLoaded(true);
    })();
  }, [clientId]);

  const handleSave = async () => {
    if (!clientId) return;
    setSaving(true);
    try {
      for (const s of WIP_STAGES.filter((x) => x.hasLimit)) {
        const val = wipLimits[s.stage];
        if (val != null) {
          await supabase.from("kanban_wip_limits").upsert(
            { client_id: clientId, stage: s.stage, wip_limit: val },
            { onConflict: "client_id,stage" }
          );
        }
      }
      toast.success("WIP limits saved");
    } catch {
      toast.error("Failed to save WIP limits");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="text-muted-foreground p-4">Loading…</p>;

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Kanban WIP Limits</CardTitle>
          <CardDescription>Set work-in-progress limits for kanban board stages.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead className="w-40">WIP Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {WIP_STAGES.map((s) => (
                <TableRow key={s.stage}>
                  <TableCell className="font-medium">{s.label}</TableCell>
                  <TableCell>
                    {s.hasLimit ? (
                      <Input
                        type="number" min="1" className="w-24"
                        value={wipLimits[s.stage] ?? ""}
                        onChange={(e) => setWipLimits((p) => ({ ...p, [s.stage]: parseInt(e.target.value) || 0 }))}
                      />
                    ) : (
                      <span className="text-muted-foreground text-sm">No limit</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-[hsl(160,80%,27%)] hover:bg-[hsl(160,80%,22%)] text-white">
          <Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save WIP Limits"}
        </Button>
      </div>
    </div>
  );
}

/* ───────── 3. Sprint Management ───────── */
function SprintSection({ clientId }: { clientId: string | null }) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [editing, setEditing] = useState<Partial<Sprint> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSprints = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase.from("sprints").select("*").eq("client_id", clientId).order("start_date", { ascending: false });
    setSprints((data as Sprint[]) ?? []);
  }, [clientId]);

  useEffect(() => { fetchSprints(); }, [fetchSprints]);

  const handleSave = async () => {
    if (!editing || !clientId) return;
    setSaving(true);
    try {
      if (editing.id) {
        await supabase.from("sprints").update({
          name: editing.name, start_date: editing.start_date,
          end_date: editing.end_date, status: editing.status,
        }).eq("id", editing.id);
      } else {
        await supabase.from("sprints").insert({
          client_id: clientId, name: editing.name,
          start_date: editing.start_date, end_date: editing.end_date,
          status: editing.status || "planning",
        });
      }
      toast.success(editing.id ? "Sprint updated" : "Sprint created");
      setEditing(null);
      fetchSprints();
    } catch {
      toast.error("Failed to save sprint");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("sprints").delete().eq("id", deleteId);
    toast.success("Sprint deleted");
    setDeleteId(null);
    fetchSprints();
  };

  const statusColor = (s: string) => {
    if (s === "active") return "bg-emerald-100 text-emerald-800";
    if (s === "completed") return "bg-slate-100 text-slate-600";
    return "bg-blue-100 text-blue-800";
  };

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Sprint Management</CardTitle>
            <CardDescription>Manage planning sprints for your initiatives.</CardDescription>
          </div>
          <Button onClick={() => setEditing({ name: "", start_date: "", end_date: "", status: "planning" as SprintStatus })} className="bg-[hsl(210,60%,28%)] hover:bg-[hsl(210,60%,22%)] text-white">
            <Plus className="h-4 w-4 mr-2" />Add Sprint
          </Button>
        </CardHeader>
        <CardContent>
          {editing && (
            <div className="border rounded-lg p-4 mb-4 bg-muted/30 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input value={editing.name ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={editing.start_date ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, start_date: e.target.value }))} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={editing.end_date ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, end_date: e.target.value }))} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editing.status ?? "planning"} onValueChange={(v) => setEditing((p) => ({ ...p!, status: v as SprintStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="bg-[hsl(160,80%,27%)] hover:bg-[hsl(160,80%,22%)] text-white">
                  <Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sprints.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No sprints configured</TableCell></TableRow>
              ) : sprints.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.start_date}</TableCell>
                  <TableCell>{s.end_date}</TableCell>
                  <TableCell><Badge className={statusColor(s.status)}>{s.status?.charAt(0).toUpperCase() + s.status?.slice(1)}</Badge></TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        title="Delete Sprint"
        description="Are you sure? Initiatives assigned to this sprint will be unassigned."
        onConfirm={handleDelete}
      />
    </div>
  );
}

/* ───────── 4. User Management ───────── */
function UserSection({ clientId }: { clientId: string | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    if (!clientId) return;
    const { data } = await supabase.from("profiles").select("*").eq("client_id", clientId).order("full_name");
    setProfiles((data as Profile[]) ?? []);
  }, [clientId]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const updateRole = async (profileId: string, newRole: UserRole) => {
    setSaving(profileId);
    await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
    toast.success("Role updated");
    setSaving(null);
    fetchProfiles();
  };

  const roleColor = (r: UserRole) => {
    if (r === "admin") return "bg-amber-100 text-amber-800";
    if (r === "contributor") return "bg-blue-100 text-blue-800";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Manage roles for existing users. New users sign up via the login page.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-48">Change Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No users found</TableCell></TableRow>
              ) : profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell><Badge className={roleColor(p.role)}>{p.role.charAt(0).toUpperCase() + p.role.slice(1)}</Badge></TableCell>
                  <TableCell>
                    <Select value={p.role} onValueChange={(v) => updateRole(p.id, v as UserRole)} disabled={saving === p.id}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="contributor">Contributor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────── 5. Client Profile ───────── */
function ClientSection({ clientId }: { clientId: string | null }) {
  const { client } = useAuth();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setName(client.name ?? "");
      setIndustry((client as any).industry ?? "");
      setLogoUrl((client as any).logo_url ?? "");
    }
  }, [client]);

  const handleSave = async () => {
    if (!clientId) return;
    setSaving(true);
    try {
      await supabase.from("clients").update({ name, industry, logo_url: logoUrl }).eq("id", clientId);
      toast.success("Client profile saved");
    } catch {
      toast.error("Failed to save client profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Client Profile</CardTitle>
          <CardDescription>Update your organization's profile information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <div>
            <Label>Client Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Industry</Label>
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Manufacturing, Technology, Healthcare" />
          </div>
          <div>
            <Label>Logo URL</Label>
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-[hsl(160,80%,27%)] hover:bg-[hsl(160,80%,22%)] text-white">
          <Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save Client Profile"}
        </Button>
      </div>
    </div>
  );
}
