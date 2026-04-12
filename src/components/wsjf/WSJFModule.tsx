import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { Plus, Printer, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import type { Initiative, WSJFConfig } from "@/types/database";

const FIB = ["1", "2", "3", "5", "8", "10", "13"];

const RISK_BADGE: Record<string, string> = {
  very_high: "bg-red-600 text-white",
  high: "bg-amber-500 text-white",
  normal: "bg-slate-500 text-white",
  low: "bg-green-600 text-white",
};

function rankBadge(rank: number) {
  if (rank === 1) return <Badge className="bg-yellow-400 text-yellow-900 font-bold">🥇 1</Badge>;
  if (rank === 2) return <Badge className="bg-gray-300 text-gray-800 font-bold">🥈 2</Badge>;
  if (rank === 3) return <Badge className="bg-amber-700 text-white font-bold">🥉 3</Badge>;
  return <span className="text-sm text-muted-foreground">{rank}</span>;
}

export default function WSJFModule() {
  const { clientId, role } = useAuth();
  const canEdit = role === "admin" || role === "contributor";
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [wsjfConfig, setWsjfConfig] = useState<WSJFConfig[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [alignmentMap, setAlignmentMap] = useState<Record<string, { title: string; strength: string }[]>>({});

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    const [{ data: inits }, { data: config }] = await Promise.all([
      supabase.from("initiatives").select("*").eq("client_id", clientId).order("wsjf_score", { ascending: false, nullsFirst: false }),
      supabase.from("wsjf_config").select("*").eq("client_id", clientId),
    ]);
    setInitiatives((inits as Initiative[]) || []);
    setWsjfConfig((config as WSJFConfig[]) || []);
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch alignment data for expanded rows
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
    // Optimistic update
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

  function FibSelect({ value, onChange, disabled }: { value: number | null; onChange: (v: number) => void; disabled?: boolean }) {
    if (disabled) return <span className="text-sm">{value ?? "—"}</span>;
    return (
      <Select value={String(value ?? 1)} onValueChange={v => onChange(Number(v))}>
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
    <div className="space-y-6 wsjf-page">
      {/* Header */}
      <div className="flex items-center justify-between wsjf-header">
        <h1 className="text-2xl font-bold text-primary">WSJF Prioritization Analysis</h1>
        <div className="flex items-center gap-2 print-hide">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {initiatives.map((ini, idx) => {
              const risk = fmtRisk(ini);
              const rank = idx + 1;
              return (
                <>
                  <TableRow
                    key={ini.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpand(ini.id)}
                  >
                    <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
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
                      <FibSelect value={ini.business_roi} onChange={v => updateField(ini.id, "business_roi", v)} disabled={!canEdit} />
                    </TableCell>
                    <TableCell className="text-center">
                      <FibSelect value={ini.planet_impact} onChange={v => updateField(ini.id, "planet_impact", v)} disabled={!canEdit} />
                    </TableCell>
                    <TableCell className="text-center">
                      <FibSelect value={ini.people_impact} onChange={v => updateField(ini.id, "people_impact", v)} disabled={!canEdit} />
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
                      <FibSelect value={ini.time_to_deploy} onChange={v => updateField(ini.id, "time_to_deploy", v)} disabled={!canEdit} />
                    </TableCell>
                    <TableCell className="text-center">{ini.wsjf_score_raw?.toFixed(2) ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      {typeof risk === "object" ? (
                        <Badge className={RISK_BADGE[risk.level] || ""}>{risk.label}</Badge>
                      ) : risk}
                    </TableCell>
                    <TableCell className="text-center font-bold">{ini.wsjf_score?.toFixed(2) ?? "—"}</TableCell>
                    <TableCell className="text-center">{rankBadge(rank)}</TableCell>
                  </TableRow>
                  {expandedId === ini.id && (
                    <TableRow key={`${ini.id}-detail`}>
                      <TableCell colSpan={11}>
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
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  No initiatives yet. <Link to="/lbc/new" className="text-primary hover:underline">Create one</Link>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
