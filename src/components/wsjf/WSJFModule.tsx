import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Printer, ExternalLink, Lock, AlertTriangle, Unlock, Zap } from "lucide-react";
import { computeAutoScores } from "@/lib/wsjf-scoring";
import { toast } from "sonner";
import type { Initiative } from "@/types/database";

const FIB = ["1", "2", "3", "5", "8", "10", "13"];

const RISK_MULTIPLIERS: Record<string, number> = {
  very_high: 0.50,
  high: 0.75,
  normal: 1.00,
  low: 1.25,
};

const RISK_BADGE: Record<string, string> = {
  very_high: "bg-red-600 text-white",
  high: "bg-amber-500 text-white",
  normal: "bg-slate-500 text-white",
  low: "bg-green-600 text-white",
};

type ScoringMode = "manual" | "auto" | "hybrid";

const SCORE_FIELDS = ["business_roi", "planet_impact", "people_impact", "time_to_deploy"] as const;

function rankBadge(rank: number) {
  if (rank === 1) return <Badge className="bg-yellow-400 text-yellow-900 font-bold">🥇 1</Badge>;
  if (rank === 2) return <Badge className="bg-gray-300 text-gray-800 font-bold">🥈 2</Badge>;
  if (rank === 3) return <Badge className="bg-amber-700 text-white font-bold">🥉 3</Badge>;
  return <span className="text-sm text-muted-foreground">{rank}</span>;
}

function ModeBadge({ mode, isAdmin }: { mode: ScoringMode; isAdmin: boolean }) {
  const labels: Record<ScoringMode, string> = {
    manual: "Manual Scoring",
    auto: "Auto Scoring",
    hybrid: "Hybrid Scoring",
  };
  const colors: Record<ScoringMode, string> = {
    manual: "bg-muted text-muted-foreground",
    auto: "bg-teal-600 text-white",
    hybrid: "bg-slate-800 text-white",
  };

  if (isAdmin) {
    return (
      <Link to="/settings">
        <Badge className={`${colors[mode]} cursor-pointer hover:opacity-80`}>
          {labels[mode]}
        </Badge>
      </Link>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={colors[mode]}>{labels[mode]}</Badge>
        </TooltipTrigger>
        <TooltipContent>Scoring mode is set by your administrator</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function WSJFModule() {
  const { clientId, role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "admin";
  const canEdit = role === "admin" || role === "contributor";
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [wsjfConfig, setWsjfConfig] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [alignmentMap, setAlignmentMap] = useState<Record<string, { title: string; strength: string }[]>>({});
  const [overriddenRows, setOverriddenRows] = useState<Set<string>>(new Set());
  const [autoScoring, setAutoScoring] = useState(false);

  const scoringMode: ScoringMode = wsjfConfig?.scoring_mode || "manual";

  // Compute auto scores for all initiatives
  const autoScoresMap = useMemo(() => {
    if (!wsjfConfig || scoringMode === "manual") return {};
    const map: Record<string, { business_roi: number; planet_impact: number; time_to_deploy: number }> = {};
    for (const ini of initiatives) {
      const scores = computeAutoScores(wsjfConfig, {
        estimated_annual_savings: ini.estimated_annual_savings,
        simple_payback_years: ini.simple_payback_years,
        estimated_co2_reduction: ini.estimated_co2_reduction,
        estimated_deploy_months: (ini as any).estimated_deploy_months ?? null,
      });
      if (scores) map[ini.id] = scores;
    }
    return map;
  }, [wsjfConfig, initiatives, scoringMode]);

  const sortedInitiatives = useMemo(() => {
    return [...initiatives].sort((a, b) => {
      const getRisk = (ini: Initiative) =>
        ini.risk_level ? (RISK_MULTIPLIERS[ini.risk_level] ?? 1) : (ini.risk_weight ?? 1);
      const getScore = (ini: Initiative) => {
        const business = autoScoresMap[ini.id]?.business_roi ?? ini.business_roi ?? 1;
        const planet = autoScoresMap[ini.id]?.planet_impact ?? ini.planet_impact ?? 1;
        const people = ini.people_impact ?? 1;
        const alignment = ini.strategic_alignment ?? 0;
        const duration = autoScoresMap[ini.id]?.time_to_deploy ?? ini.time_to_deploy ?? 1;
        const raw = duration > 0 ? (business + planet + people + alignment) / duration : 0;
        return raw * getRisk(ini);
      };
      return getScore(b) - getScore(a);
    });
  }, [initiatives, autoScoresMap]);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    const [{ data: inits }, { data: config }] = await Promise.all([
      supabase.from("initiatives").select("*").eq("client_id", clientId).order("wsjf_score", { ascending: false, nullsFirst: false }),
      supabase.from("wsjf_config").select("*").eq("client_id", clientId),
    ]);
    setInitiatives((inits as Initiative[]) || []);
    if (config && config.length > 0) {
      setWsjfConfig(config[0]);
    }
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Persist auto-scores to DB when computed
  useEffect(() => {
    if (!autoScoresMap || Object.keys(autoScoresMap).length === 0) return;

    const persistScores = async () => {
      let anyWritten = false;
      for (const [initId, scores] of Object.entries(autoScoresMap)) {
        const updatePayload: Record<string, number> = {};
        if (scores.business_roi) updatePayload.business_roi = scores.business_roi;
        if (scores.planet_impact) updatePayload.planet_impact = scores.planet_impact;
        if (scores.time_to_deploy) updatePayload.time_to_deploy = scores.time_to_deploy;

        if (Object.keys(updatePayload).length === 0) continue;

        const initiative = initiatives.find(i => i.id === initId);
        if (initiative) {
          const alreadyCorrect =
            (!updatePayload.business_roi || initiative.business_roi === updatePayload.business_roi) &&
            (!updatePayload.planet_impact || initiative.planet_impact === updatePayload.planet_impact) &&
            (!updatePayload.time_to_deploy || initiative.time_to_deploy === updatePayload.time_to_deploy);
          if (alreadyCorrect) continue;
        }

        console.log("[WSJF Persist] Writing scores for:", initId, updatePayload);
        const { error } = await supabase.from("initiatives").update(updatePayload).eq("id", initId);
        if (error) {
          console.error("[WSJF Persist] Write failed:", initId, error);
        } else {
          anyWritten = true;
        }
      }
      if (anyWritten) fetchData();
    };

    persistScores();
  }, [autoScoresMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto Scoring button handler
  const handleAutoScore = async () => {
    if (!clientId || !initiatives.length || !wsjfConfig) return;
    setAutoScoring(true);
    let scored = 0;
    let failed = 0;

    for (const ini of initiatives) {
      try {
        const scores = computeAutoScores(wsjfConfig, {
          estimated_annual_savings: ini.estimated_annual_savings,
          simple_payback_years: ini.simple_payback_years,
          estimated_co2_reduction: ini.estimated_co2_reduction,
          estimated_deploy_months: (ini as any).estimated_deploy_months ?? null,
        });
        if (scores) {
          const updatePayload: Record<string, number> = {};
          if (scores.business_roi) updatePayload.business_roi = scores.business_roi;
          if (scores.planet_impact) updatePayload.planet_impact = scores.planet_impact;
          if (scores.time_to_deploy) updatePayload.time_to_deploy = scores.time_to_deploy;

          if (Object.keys(updatePayload).length > 0) {
            const { error } = await supabase.from("initiatives").update(updatePayload).eq("id", ini.id);
            if (error) { failed++; console.error("[AutoScore] Write failed:", ini.id, error); }
            else { scored++; console.log("[AutoScore] Saved:", ini.id, updatePayload); }
          }
        }
      } catch (e) {
        console.error("[AutoScore] Error:", ini.id, e);
        failed++;
      }
    }

    toast.success(`Auto-scored ${scored} initiative${scored !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`);
    await fetchData();
    setAutoScoring(false);
  };

  const fetchAlignments = useCallback(async (initiativeId: string) => {
    if (alignmentMap[initiativeId]) return;
    const { data } = await supabase
      .from("lbc_objective_alignments")
      .select("objective_id, strength")
      .eq("initiative_id", initiativeId);
    if (!data || data.length === 0) {
      setAlignmentMap(prev => ({ ...prev, [initiativeId]: [] }));
      return;
    }
    const objIds = data.map((d: any) => d.objective_id);
    const { data: objs } = await supabase
      .from("xmatrix_annual_objectives")
      .select("id, title")
      .in("id", objIds);
    const objMap = new Map((objs || []).map((o: any) => [o.id, o.title]));
    setAlignmentMap(prev => ({
      ...prev,
      [initiativeId]: data.map((d: any) => ({
        title: objMap.get(d.objective_id) || "Unknown",
        strength: d.strength,
      })),
    }));
  }, [alignmentMap]);

  async function updateField(id: string, field: string, value: number) {
    setInitiatives(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    await supabase.from("initiatives").update({ [field]: value }).eq("id", id);
    fetchData();
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      fetchAlignments(id);
    }
  }

  function toggleOverride(id: string) {
    setOverriddenRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isFieldEditable(ini: Initiative, field: string): boolean {
    if (!canEdit) return false;
    if (scoringMode === "manual") return true;
    if (scoringMode === "hybrid") return true;
    if (scoringMode === "auto") return overriddenRows.has(ini.id);
    return false;
  }

  function isManuallyChanged(ini: Initiative, field: string): boolean {
    const auto = autoScoresMap[ini.id];
    if (!auto) return false;
    const autoVal = (auto as any)[field];
    const curVal = (ini as any)[field];
    if (autoVal == null) return false;
    return curVal != null && curVal !== autoVal;
  }

  // Get display value: prefer autoScoresMap over DB value
  function getDisplayScore(ini: Initiative, field: "business_roi" | "planet_impact" | "time_to_deploy"): number | null {
    const auto = autoScoresMap[ini.id];
    if (auto && (auto as any)[field] != null) return (auto as any)[field];
    return (ini as any)[field];
  }

  function ScoreCell({
    ini,
    field,
    value,
  }: {
    ini: Initiative;
    field: string;
    value: number | null;
  }) {
    const editable = isFieldEditable(ini, field);
    const auto = autoScoresMap[ini.id];
    const autoVal = auto ? (auto as any)[field] : null;
    // Use display value (auto-computed preferred)
    const displayValue = autoVal ?? value;

    // AUTO mode - locked display
    if (scoringMode === "auto" && !overriddenRows.has(ini.id)) {
      const wasOverridden = autoVal != null && value != null && value !== autoVal;
      return (
        <span className="inline-flex items-center gap-1 text-sm">
          {displayValue ?? "—"}
          {autoVal != null ? (
            <Zap className="h-3 w-3 text-teal-500" />
          ) : (
            <Lock className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
      );
    }

    // AUTO mode - overridden (unlocked)
    if (scoringMode === "auto" && overriddenRows.has(ini.id)) {
      return (
        <span className="inline-flex items-center gap-1">
          <Select value={String(displayValue ?? 1)} onValueChange={v => updateField(ini.id, field, Number(v))}>
            <SelectTrigger className="h-8 w-16 text-xs" onClick={e => e.stopPropagation()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIB.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          {autoVal != null && value != null && value !== autoVal && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent>Manually overridden — auto-score was {autoVal}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </span>
      );
    }

    // HYBRID mode
    if (scoringMode === "hybrid" && canEdit) {
      const isAuto = autoVal != null && value === autoVal;
      return (
        <span className="inline-flex items-center gap-1">
          <Select value={String(displayValue ?? 1)} onValueChange={v => updateField(ini.id, field, Number(v))}>
            <SelectTrigger className="h-8 w-16 text-xs" onClick={e => e.stopPropagation()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIB.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          {autoVal != null && (
            <Badge className={`text-[10px] px-1 py-0 leading-tight ${isAuto ? "bg-teal-600 text-white" : "bg-muted text-muted-foreground"}`}>
              {isAuto ? "auto" : "manual"}
            </Badge>
          )}
        </span>
      );
    }

    // MANUAL mode or viewer
    if (!editable) return <span className="text-sm">{displayValue ?? "—"}</span>;
    return (
      <Select value={String(displayValue ?? 1)} onValueChange={v => updateField(ini.id, field, Number(v))}>
        <SelectTrigger className="h-8 w-16 text-xs" onClick={e => e.stopPropagation()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FIB.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }

  const handlePrint = () => window.print();

  const fmtCurrency = (v: number | null) => v != null ? `$${v.toLocaleString()}` : "—";
  const fmtRisk = (ini: Initiative) => {
    if (!ini.risk_level) return "—";
    const label = ini.risk_level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const weight = ini.risk_weight != null ? ` (${ini.risk_weight.toFixed(2)})` : "";
    return { label: `${label}${weight}`, level: ini.risk_level };
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 wsjf-page">
        {/* Header */}
        <div className="flex items-center justify-between wsjf-header">
          <h1 className="text-2xl font-bold text-primary">WSJF Prioritization Analysis</h1>
          <div className="flex items-center gap-2 print-hide">
            <ModeBadge mode={scoringMode} isAdmin={isAdmin} />
            {scoringMode !== "manual" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoScore}
                disabled={autoScoring}
                className="text-teal-600 border-teal-600 hover:bg-teal-50"
              >
                <Zap className="h-4 w-4 mr-1" />
                {autoScoring ? "Scoring..." : "Auto Score"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Link to="/lbc/new">
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add New Initiative</Button>
            </Link>
          </div>
        </div>

        {/* Print header */}
        <div className="wsjf-print-header hidden">
          <div className="font-bold tracking-widest">PHOENIX — WSJF Prioritization Analysis</div>
          <div className="text-sm text-muted-foreground mt-1">{new Date().toLocaleDateString()}</div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">No.</TableHead>
                <TableHead>Initiative Name</TableHead>
                <TableHead className="text-center">Business Impact</TableHead>
                <TableHead className="text-center">Planet Impact</TableHead>
                <TableHead className="text-center">People Impact</TableHead>
                <TableHead className="text-center">Strategy Alignment</TableHead>
                <TableHead className="text-center">Initiative Duration</TableHead>
                <TableHead className="text-center">Raw WSJF</TableHead>
                <TableHead className="text-center">Risk Adjustment</TableHead>
                <TableHead className="text-center">Final WSJF</TableHead>
                <TableHead className="text-center">Ranked Priority</TableHead>
                {scoringMode === "auto" && isAdmin && <TableHead className="w-10 print-hide" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedInitiatives.map((ini, idx) => {
                const risk = fmtRisk(ini);
                const rank = idx + 1;
                const isOverridden = overriddenRows.has(ini.id);

                // Use computed auto-scores for display
                const dispBusiness = getDisplayScore(ini, "business_roi") ?? 1;
                const dispPlanet = getDisplayScore(ini, "planet_impact") ?? 1;
                const dispDuration = getDisplayScore(ini, "time_to_deploy") ?? 1;
                const dispPeople = ini.people_impact ?? 1;
                const dispAlignment = ini.strategic_alignment ?? 0;
                const rawWsjf = dispDuration > 0
                  ? (dispBusiness + dispPlanet + dispPeople + dispAlignment) / dispDuration
                  : null;
                const riskWeight = ini.risk_level ? (RISK_MULTIPLIERS[ini.risk_level] ?? 1) : (ini.risk_weight ?? 1);
                const finalWsjf = rawWsjf != null ? rawWsjf * riskWeight : null;

                return (
                  <>
                    <TableRow
                      key={ini.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpand(ini.id)}
                    >
                      <TableCell className="text-muted-foreground text-xs">{rank}</TableCell>
                      <TableCell className="font-medium">
                        <Link
                          to="/lbc/$id"
                          params={{ id: ini.id }}
                          className="text-primary hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {ini.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreCell ini={ini} field="business_roi" value={ini.business_roi} />
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreCell ini={ini} field="planet_impact" value={ini.planet_impact} />
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreCell ini={ini} field="people_impact" value={ini.people_impact} />
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1">
                          {ini.strategic_alignment ?? "—"}
                          <Link
                            to="/lbc/$id"
                            params={{ id: ini.id }}
                            className="text-muted-foreground hover:text-primary"
                            onClick={e => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <ScoreCell ini={ini} field="time_to_deploy" value={ini.time_to_deploy} />
                      </TableCell>
                      <TableCell className="text-center">{rawWsjf?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="text-center">
                        {typeof risk === "object" ? (
                          <Badge className={RISK_BADGE[risk.level] || ""}>{risk.label}</Badge>
                        ) : risk}
                      </TableCell>
                      <TableCell className="text-center font-bold">{finalWsjf?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="text-center">{rankBadge(rank)}</TableCell>
                      {scoringMode === "auto" && isAdmin && (
                        <TableCell className="text-center print-hide">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={e => { e.stopPropagation(); toggleOverride(ini.id); }}
                          >
                            {isOverridden ? (
                              <Lock className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                    {expandedId === ini.id && (
                      <TableRow key={`${ini.id}-detail`}>
                        <TableCell colSpan={scoringMode === "auto" && isAdmin ? 12 : 11}>
                          <Card className="my-2">
                            <CardContent className="p-4 space-y-3 text-sm">
                              {ini.description && (
                                <div>
                                  <span className="font-medium text-muted-foreground">Description: </span>
                                  {ini.description}
                                </div>
                              )}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div><span className="text-muted-foreground">MVP Cost:</span> {fmtCurrency(ini.mvp_cost)}</div>
                                <div><span className="text-muted-foreground">Deployment Cost:</span> {fmtCurrency(ini.estimated_deployment_cost)}</div>
                                <div><span className="text-muted-foreground">Annual Savings:</span> {fmtCurrency(ini.estimated_annual_savings)}</div>
                                <div><span className="text-muted-foreground">CO₂ Reduction:</span> {ini.estimated_co2_reduction != null ? `${ini.estimated_co2_reduction} tCO₂e` : "—"}</div>
                              </div>
                              {alignmentMap[ini.id] && alignmentMap[ini.id].length > 0 && (
                                <div>
                                  <span className="font-medium text-muted-foreground">Strategic Objectives:</span>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {alignmentMap[ini.id].map((a, i) => (
                                      <Badge key={i} variant="outline" className="text-xs">
                                        {a.title} — {a.strength}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {ini.lbc_decision && (
                                <div>
                                  <span className="font-medium text-muted-foreground">LBC Decision: </span>
                                  <Badge variant="outline">
                                    {ini.lbc_decision.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                  </Badge>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
              {!initiatives.length && (
                <TableRow>
                  <TableCell colSpan={scoringMode === "auto" && isAdmin ? 12 : 11} className="text-center text-muted-foreground py-8">
                    No initiatives yet. <Link to="/lbc/new" className="text-primary hover:underline">Create one</Link>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}
