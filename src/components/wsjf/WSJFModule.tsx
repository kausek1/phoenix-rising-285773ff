import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { Initiative, RiskLevel, WSJFConfig } from "@/types/database";

const FIB = ["1", "2", "3", "5", "8", "10", "13"];
const RISK_COLOR: Record<string, string> = {
  very_high: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  normal: "bg-muted-foreground text-primary-foreground",
  low: "bg-success text-success-foreground",
};
const STAGE_COLOR: Record<string, string> = {
  funnel: "bg-muted text-muted-foreground", review: "bg-primary/20 text-primary",
  analysis: "bg-warning/20 text-warning", ready: "bg-accent/20 text-accent",
  in_delivery: "bg-accent text-accent-foreground", deployed: "bg-success text-success-foreground",
  closed: "bg-muted-foreground text-primary-foreground", archive: "bg-muted text-muted-foreground",
};

export default function WSJFModule() {
  const { clientId, role } = useAuth();
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [wsjfConfig, setWsjfConfig] = useState<WSJFConfig[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!clientId) return;
    const [{ data: inits }, { data: config }] = await Promise.all([
      supabase.from("initiatives").select("*").eq("client_id", clientId).order("wsjf_score", { ascending: false, nullsFirst: false }),
      supabase.from("wsjf_config").select("*").eq("client_id", clientId),
    ]);
    setInitiatives((inits as Initiative[]) || []);
    setWsjfConfig((config as WSJFConfig[]) || []);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function updateField(id: string, field: string, value: number) {
    const updates: Record<string, any> = { [field]: value };
    if (field === "risk_level") {
      const cfg = wsjfConfig.find(c => c.risk_level === value as unknown as RiskLevel);
      if (cfg) updates.risk_weight = cfg.risk_weight;
    }
    await supabase.from("initiatives").update(updates).eq("id", id);
    fetch();
  }

  function FibSelect({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
    return (
      <Select value={String(value ?? 1)} onValueChange={v => onChange(Number(v))}>
        <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
        <SelectContent>{FIB.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
      </Select>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">WSJF Scoring</h1>
        <Link to="/lbc">
          <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Initiative</Button>
        </Link>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Biz ROI</TableHead>
            <TableHead>Planet</TableHead>
            <TableHead>People</TableHead>
            <TableHead>Strategy</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Raw</TableHead>
            <TableHead>WSJF</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {initiatives.map((ini, idx) => (
              <>
                <TableRow key={ini.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === ini.id ? null : ini.id)}>
                  <TableCell className="font-bold text-accent">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{ini.title}</TableCell>
                  <TableCell><FibSelect value={ini.business_roi} onChange={v => updateField(ini.id, "business_roi", v)} /></TableCell>
                  <TableCell><FibSelect value={ini.planet_impact} onChange={v => updateField(ini.id, "planet_impact", v)} /></TableCell>
                  <TableCell><FibSelect value={ini.people_impact} onChange={v => updateField(ini.id, "people_impact", v)} /></TableCell>
                  <TableCell>{ini.strategic_alignment ?? "—"}</TableCell>
                  <TableCell><FibSelect value={ini.time_to_deploy} onChange={v => updateField(ini.id, "time_to_deploy", v)} /></TableCell>
                  <TableCell>{ini.risk_level && <Badge className={RISK_COLOR[ini.risk_level] || ""}>{ini.risk_level.replace(/_/g, " ")}</Badge>}</TableCell>
                  <TableCell>{ini.wsjf_score_raw?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell className="font-bold">{ini.wsjf_score?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell><Badge className={STAGE_COLOR[ini.stage] || ""}>{ini.stage}</Badge></TableCell>
                  <TableCell>{ini.owner_name || "—"}</TableCell>
                  <TableCell>{expandedId === ini.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</TableCell>
                </TableRow>
                {expandedId === ini.id && (
                  <TableRow key={`${ini.id}-detail`}>
                    <TableCell colSpan={13}>
                      <Card className="my-2">
                        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 text-sm">
                          <div><span className="text-muted-foreground">Description:</span> {ini.description || "—"}</div>
                          <div><span className="text-muted-foreground">MVP Cost:</span> {ini.mvp_cost ?? "—"}</div>
                          <div><span className="text-muted-foreground">Annual Savings:</span> {ini.estimated_annual_savings ?? "—"}</div>
                          <div><span className="text-muted-foreground">CO₂ Reduction:</span> {ini.estimated_co2_reduction ?? "—"}</div>
                          <div><span className="text-muted-foreground">Risk Level:</span> {ini.risk_level ?? "—"}</div>
                          <div><span className="text-muted-foreground">LBC Decision:</span> {ini.lbc_decision ?? "—"}</div>
                          <div><span className="text-muted-foreground">Funnel Entry:</span> {ini.funnel_entry_date ?? "—"}</div>
                          <div><span className="text-muted-foreground">Due Date:</span> {ini.due_date ?? "—"}</div>
                        </CardContent>
                      </Card>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
            {!initiatives.length && <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">No initiatives yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
