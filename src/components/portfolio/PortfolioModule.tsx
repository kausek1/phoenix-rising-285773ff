import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SlideOver } from "@/components/shared/SlideOver";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import type { Asset, Emission, ReductionTarget } from "@/types/database";

const SCOPE_COLORS = ["#1B4F72", "#0E7A65", "#2C3E50"];
const PIE_COLORS = ["#1B4F72", "#0E7A65", "#D97706", "#16A34A", "#DC2626", "#2C3E50"];

export default function PortfolioModule() {
  const { clientId, role } = useAuth();
  const canEdit = role === "admin" || role === "contributor";
  const canDelete = role === "admin";
  const [tab, setTab] = useState("assets");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [emissions, setEmissions] = useState<Emission[]>([]);
  const [targets, setTargets] = useState<ReductionTarget[]>([]);
  const [slideOpen, setSlideOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const fetch = useCallback(async () => {
    if (!clientId) return;
    const [{ data: a }, { data: e }, { data: t }] = await Promise.all([
      supabase.from("assets").select("*").eq("client_id", clientId),
      supabase.from("emissions").select("*").eq("client_id", clientId),
      supabase.from("reduction_targets").select("*").eq("client_id", clientId),
    ]);
    setAssets((a as Asset[]) || []);
    setEmissions((e as Emission[]) || []);
    setTargets((t as ReductionTarget[]) || []);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function saveAsset() {
    if (editAsset) {
      const { id, client_id, created_at, updated_at, ...payload } = form;
      await supabase.from("assets").update(payload).eq("id", editAsset.id);
    } else {
      const { id, created_at, updated_at, ...payload } = form;
      await supabase.from("assets").insert({ ...payload, client_id: clientId });
    }
    setSlideOpen(false);
    setEditAsset(null);
    setForm({});
    fetch();
  }

  async function deleteAsset() {
    if (!deleteId) return;
    await supabase.from("assets").delete().eq("id", deleteId);
    setDeleteId(null);
    fetch();
  }

  const totalArea = assets.reduce((s, a) => s + (a.gross_floor_area_m2 || 0), 0);
  const latestYear = emissions.length ? Math.max(...emissions.map(e => e.reporting_year)) : new Date().getFullYear();
  const thisYearEmissions = emissions.filter(e => e.reporting_year === latestYear).reduce((s, e) => s + e.co2e_tonnes, 0);
  const lastYearEmissions = emissions.filter(e => e.reporting_year === latestYear - 1).reduce((s, e) => s + e.co2e_tonnes, 0);
  const yoyChange = lastYearEmissions ? ((thisYearEmissions - lastYearEmissions) / lastYearEmissions * 100) : 0;

  const emissionsByYear = Object.values(
    emissions.reduce((acc: Record<number, any>, e) => {
      if (!acc[e.reporting_year]) acc[e.reporting_year] = { year: e.reporting_year, scope_1: 0, scope_2: 0, scope_3: 0 };
      acc[e.reporting_year][e.scope] += e.co2e_tonnes;
      return acc;
    }, {})
  ).sort((a: any, b: any) => a.year - b.year);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">Portfolio & Emissions</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="assets">Assets</TabsTrigger><TabsTrigger value="dashboard">Dashboard</TabsTrigger></TabsList>

        <TabsContent value="assets">
          <div className="flex justify-end mb-2">
            {canEdit && <Button size="sm" onClick={() => { setEditAsset(null); setForm({}); setSlideOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Add Asset</Button>}
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>City/Country</TableHead>
              <TableHead>GFA (m²)</TableHead><TableHead>Year Built</TableHead><TableHead>Certification</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-24">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assets.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{a.asset_type}</TableCell>
                  <TableCell>{[a.city, a.country].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell>{a.gross_floor_area_m2?.toLocaleString() ?? "—"}</TableCell>
                  <TableCell>{a.year_built ?? "—"}</TableCell>
                  <TableCell>{a.certification || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{a.status || "active"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {canEdit && <Button variant="ghost" size="icon" onClick={() => { setEditAsset(a); const { id, client_id, created_at, updated_at, ...rest } = a as any; setForm(rest); setSlideOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {canDelete && <Button variant="ghost" size="icon" onClick={() => setDeleteId(a.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!assets.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No assets yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="dashboard">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Assets</p><p className="text-2xl font-bold text-primary">{assets.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Floor Area</p><p className="text-2xl font-bold text-primary">{totalArea.toLocaleString()} m²</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Emissions This Year</p><p className="text-2xl font-bold text-primary">{thisYearEmissions.toLocaleString()} tCO₂e</p></CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Year-on-Year</p>
              <p className={`text-2xl font-bold flex items-center gap-1 ${yoyChange <= 0 ? "text-success" : "text-destructive"}`}>
                {yoyChange <= 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                {Math.abs(yoyChange).toFixed(1)}%
              </p>
            </CardContent></Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Emissions by Scope</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={emissionsByYear}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip />
                  <Legend /><Bar dataKey="scope_1" fill={SCOPE_COLORS[0]} name="Scope 1" stackId="a" />
                  <Bar dataKey="scope_2" fill={SCOPE_COLORS[1]} name="Scope 2" stackId="a" />
                  <Bar dataKey="scope_3" fill={SCOPE_COLORS[2]} name="Scope 3" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Reduction Targets</h3>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Scope</TableHead><TableHead>Baseline</TableHead><TableHead>Target Year</TableHead>
                  <TableHead>Reduction %</TableHead><TableHead>SBTi</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {targets.map(t => (
                    <TableRow key={t.id}>
                      <TableCell>{t.scope}</TableCell>
                      <TableCell>{t.baseline_year} ({t.baseline_co2e} t)</TableCell>
                      <TableCell>{t.target_year}</TableCell>
                      <TableCell>{t.target_reduction_pct}%</TableCell>
                      <TableCell>{t.sbti_approved ? <Badge className="bg-success text-success-foreground">Approved</Badge> : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!targets.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No targets set</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>

      <SlideOver open={slideOpen} onClose={() => { setSlideOpen(false); setEditAsset(null); }} title={editAsset ? "Edit Asset" : "Add Asset"}>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Asset Type</Label><Input value={form.asset_type || ""} onChange={e => setForm({ ...form, asset_type: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city || ""} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label>Country</Label><Input value={form.country || ""} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
          <div><Label>GFA (m²)</Label><Input type="number" value={form.gross_floor_area_m2 ?? ""} onChange={e => setForm({ ...form, gross_floor_area_m2: e.target.value ? Number(e.target.value) : null })} /></div>
          <div><Label>Year Built</Label><Input type="number" value={form.year_built ?? ""} onChange={e => setForm({ ...form, year_built: e.target.value ? Number(e.target.value) : null })} /></div>
          <div><Label>Certification</Label><Input value={form.certification || ""} onChange={e => setForm({ ...form, certification: e.target.value })} /></div>
          <Button className="w-full mt-4" onClick={saveAsset}>Save</Button>
        </div>
      </SlideOver>

      <ConfirmDialog open={!!deleteId} onConfirm={deleteAsset} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
