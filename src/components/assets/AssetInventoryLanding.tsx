import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlideOver } from "@/components/shared/SlideOver";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import type { Asset, AssetCategory, Emission, ReductionTarget } from "@/types/database";

const SCOPE_COLORS = ["#1B4F72", "#0E7A65", "#2C3E50"];
const PIE_COLORS = ["#1B4F72", "#0E7A65", "#D97706", "#16A34A", "#DC2626", "#2C3E50", "#7C3AED", "#EA580C"];

const CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: "facility", label: "Facility" },
  { value: "vehicle", label: "Vehicle" },
  { value: "capital_good", label: "Capital Good" },
  { value: "purchased_energy", label: "Purchased Energy" },
  { value: "land", label: "Land" },
  { value: "other", label: "Other" },
];

const STATUSES = ["Active", "Inactive", "Disposed"];

export default function AssetInventoryLanding() {
  const { clientId, role } = useAuth();
  const canEdit = role === "admin" || role === "contributor";
  const canDelete = role === "admin";

  const [tab, setTab] = useState("all");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [emissions, setEmissions] = useState<Emission[]>([]);
  const [targets, setTargets] = useState<ReductionTarget[]>([]);
  const [energyData, setEnergyData] = useState<any[]>([]);

  const [slideOpen, setSlideOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  // Target form
  const [targetSlideOpen, setTargetSlideOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReductionTarget | null>(null);
  const [targetForm, setTargetForm] = useState<Record<string, any>>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    const [{ data: a }, { data: e }, { data: t }, { data: en }] = await Promise.all([
      supabase.from("assets").select("*").eq("client_id", clientId),
      supabase.from("emissions").select("*").eq("client_id", clientId),
      supabase.from("reduction_targets").select("*").eq("client_id", clientId),
      supabase.from("energy_consumption").select("*").eq("client_id", clientId),
    ]);
    setAssets((a as Asset[]) || []);
    setEmissions((e as Emission[]) || []);
    setTargets((t as ReductionTarget[]) || []);
    setEnergyData(en || []);
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sf = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));
  const category = form.asset_category as AssetCategory | undefined;
  const showAddress = category === "facility" || category === "land";
  const showFacility = category === "facility";

  function openAdd() {
    setEditAsset(null);
    setForm({});
    setSlideOpen(true);
  }

  function openEdit(a: Asset) {
    setEditAsset(a);
    const { id, client_id, created_at, updated_at, ...rest } = a as any;
    setForm(rest);
    setSlideOpen(true);
  }

  async function saveAsset() {
    const payload = { ...form };
    delete payload.id; delete payload.client_id; delete payload.created_at; delete payload.updated_at;
    if (editAsset) {
      await supabase.from("assets").update(payload).eq("id", editAsset.id);
    } else {
      await supabase.from("assets").insert({ ...payload, client_id: clientId });
    }
    setSlideOpen(false);
    setEditAsset(null);
    setForm({});
    fetchData();
  }

  async function deleteAsset() {
    if (!deleteId) return;
    await supabase.from("assets").delete().eq("id", deleteId);
    setDeleteId(null);
    fetchData();
  }

  async function saveTarget() {
    const payload = { ...targetForm };
    delete payload.id; delete payload.client_id; delete payload.created_at; delete payload.updated_at;
    if (editTarget) {
      await supabase.from("reduction_targets").update(payload).eq("id", editTarget.id);
    } else {
      await supabase.from("reduction_targets").insert({ ...payload, client_id: clientId });
    }
    setTargetSlideOpen(false);
    setEditTarget(null);
    setTargetForm({});
    fetchData();
  }

  async function deleteTarget() {
    if (!deleteTargetId) return;
    await supabase.from("reduction_targets").delete().eq("id", deleteTargetId);
    setDeleteTargetId(null);
    fetchData();
  }

  // Filtered assets
  const filtered = tab === "all" || tab === "dashboard"
    ? assets
    : assets.filter(a => a.asset_category === tab);

  // Dashboard data
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

  // Emissions by asset
  const emissionsByAsset = Object.entries(
    emissions.reduce((acc: Record<string, number>, e) => {
      const asset = assets.find(a => a.id === e.asset_id);
      const name = asset?.name || "Unknown";
      acc[name] = (acc[name] || 0) + e.co2e_tonnes;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Energy by fuel type
  const energyByFuel = Object.entries(
    energyData.reduce((acc: Record<string, number>, e: any) => {
      acc[e.fuel_type] = (acc[e.fuel_type] || 0) + e.quantity;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  // Progress vs targets
  const targetLines = targets.map(t => {
    const years: any[] = [];
    for (let y = t.baseline_year; y <= t.target_year; y++) {
      const progress = (y - t.baseline_year) / (t.target_year - t.baseline_year);
      const targetVal = t.baseline_co2e * (1 - (t.target_reduction_pct / 100) * progress);
      const actual = emissions.filter(e => e.reporting_year === y && e.scope === t.scope).reduce((s, e) => s + e.co2e_tonnes, 0);
      years.push({ year: y, target: Math.round(targetVal), actual: actual || undefined });
    }
    return { scope: t.scope, data: years };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">Asset Inventory</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="facility">Facilities</TabsTrigger>
          <TabsTrigger value="vehicle">Vehicles</TabsTrigger>
          <TabsTrigger value="capital_good">Capital Goods</TabsTrigger>
          <TabsTrigger value="land">Land</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        {/* Asset tables */}
        {["all", "facility", "vehicle", "capital_good", "land"].map(tabKey => (
          <TabsContent key={tabKey} value={tabKey}>
            <div className="flex justify-end mb-2">
              {canEdit && (
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-4 w-4 mr-1" /> Add Asset
                </Button>
              )}
            </div>
            <AssetTable
              assets={filtered}
              tab={tabKey}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={openEdit}
              onDelete={setDeleteId}
            />
          </TabsContent>
        ))}

        {/* Dashboard */}
        <TabsContent value="dashboard">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Assets</p>
              <p className="text-2xl font-bold text-primary">{assets.length}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Floor Area</p>
              <p className="text-2xl font-bold text-primary">{totalArea.toLocaleString()} m²</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Emissions This Year</p>
              <p className="text-2xl font-bold text-primary">{thisYearEmissions.toLocaleString()} tCO₂e</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Year-on-Year</p>
              <p className={`text-2xl font-bold flex items-center gap-1 ${yoyChange <= 0 ? "text-green-600" : "text-red-600"}`}>
                {yoyChange <= 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                {Math.abs(yoyChange).toFixed(1)}%
              </p>
            </CardContent></Card>
          </div>

          {/* Charts 2x2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Total Emissions by Scope</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={emissionsByYear}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip /><Legend />
                  <Bar dataKey="scope_1" fill={SCOPE_COLORS[0]} name="Scope 1" stackId="a" />
                  <Bar dataKey="scope_2" fill={SCOPE_COLORS[1]} name="Scope 2" stackId="a" />
                  <Bar dataKey="scope_3" fill={SCOPE_COLORS[2]} name="Scope 3" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Emissions by Asset</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={emissionsByAsset} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={120} /><Tooltip />
                  <Bar dataKey="value" fill={SCOPE_COLORS[0]} name="tCO₂e" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Progress vs Reduction Targets</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={targetLines[0]?.data || []}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip /><Legend />
                  <Line type="monotone" dataKey="actual" stroke={SCOPE_COLORS[0]} name="Actual" strokeWidth={2} />
                  <Line type="monotone" dataKey="target" stroke={SCOPE_COLORS[1]} name="Target" strokeWidth={2} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Energy by Fuel Type</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={energyByFuel} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label>
                    {energyByFuel.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </div>

          {/* Reduction Targets table */}
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Reduction Targets</h3>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => { setEditTarget(null); setTargetForm({}); setTargetSlideOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Target
                </Button>
              )}
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Baseline Year</TableHead>
                <TableHead>Baseline tCO₂e</TableHead>
                <TableHead>Target Year</TableHead>
                <TableHead>Reduction %</TableHead>
                <TableHead>Target tCO₂e</TableHead>
                <TableHead>Methodology</TableHead>
                <TableHead>Science-Based</TableHead>
                <TableHead>SBTi</TableHead>
                {canEdit && <TableHead className="w-20">Actions</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {targets.map(t => (
                  <TableRow key={t.id}>
                    <TableCell>{t.scope.replace(/_/g, " ").toUpperCase()}</TableCell>
                    <TableCell>{t.baseline_year}</TableCell>
                    <TableCell>{t.baseline_co2e.toLocaleString()}</TableCell>
                    <TableCell>{t.target_year}</TableCell>
                    <TableCell>{t.target_reduction_pct}%</TableCell>
                    <TableCell>{t.target_co2e?.toLocaleString() ?? "—"}</TableCell>
                    <TableCell>{t.methodology || "—"}</TableCell>
                    <TableCell>{t.science_based ? <Badge className="bg-green-600 text-white text-xs">Yes</Badge> : "—"}</TableCell>
                    <TableCell>{t.sbti_approved ? <Badge className="bg-green-600 text-white text-xs">Approved</Badge> : "—"}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => {
                            setEditTarget(t);
                            const { id, client_id, created_at, updated_at, ...rest } = t as any;
                            setTargetForm(rest);
                            setTargetSlideOpen(true);
                          }}><Pencil className="h-3.5 w-3.5" /></Button>
                          {canDelete && <Button variant="ghost" size="icon" onClick={() => setDeleteTargetId(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {!targets.length && <TableRow><TableCell colSpan={canEdit ? 10 : 9} className="text-center text-muted-foreground py-4">No targets set</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Asset Add/Edit Slide-over */}
      <SlideOver open={slideOpen} onClose={() => { setSlideOpen(false); setEditAsset(null); }} title={editAsset ? "Edit Asset" : "Add Asset"}>
        <div className="space-y-3">
          <div>
            <Label>Category *</Label>
            <Select value={form.asset_category || "__unassigned__"} onValueChange={v => sf("asset_category", v === "__unassigned__" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__" disabled>Select category</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Name *</Label><Input value={form.name || ""} onChange={e => sf("name", e.target.value)} /></div>
          <div><Label>Sub-Type</Label><Input value={form.asset_type || ""} onChange={e => sf("asset_type", e.target.value)} /></div>

          {showAddress && (
            <>
              <div><Label>Address</Label><Input value={form.address || ""} onChange={e => sf("address", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>City</Label><Input value={form.city || ""} onChange={e => sf("city", e.target.value)} /></div>
                <div><Label>State/Province</Label><Input value={form.state_province || ""} onChange={e => sf("state_province", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Country</Label><Input value={form.country || ""} onChange={e => sf("country", e.target.value)} /></div>
                <div><Label>Postal Code</Label><Input value={form.postal_code || ""} onChange={e => sf("postal_code", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Latitude</Label><Input type="number" step="any" value={form.latitude ?? ""} onChange={e => sf("latitude", e.target.value ? Number(e.target.value) : null)} /></div>
                <div><Label>Longitude</Label><Input type="number" step="any" value={form.longitude ?? ""} onChange={e => sf("longitude", e.target.value ? Number(e.target.value) : null)} /></div>
              </div>
            </>
          )}

          {showFacility && (
            <>
              <div><Label>GFA (m²)</Label><Input type="number" value={form.gross_floor_area_m2 ?? ""} onChange={e => sf("gross_floor_area_m2", e.target.value ? Number(e.target.value) : null)} /></div>
              <div><Label>Year Built</Label><Input type="number" value={form.year_built ?? ""} onChange={e => sf("year_built", e.target.value ? Number(e.target.value) : null)} /></div>
              <div><Label>Certification</Label><Input value={form.certification || ""} onChange={e => sf("certification", e.target.value)} /></div>
            </>
          )}

          <div>
            <Label>Status</Label>
            <Select value={form.status || "__unassigned__"} onValueChange={v => sf("status", v === "__unassigned__" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Not set</SelectItem>
                {STATUSES.map(s => <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes / Description</Label><Textarea value={form.notes || ""} onChange={e => sf("notes", e.target.value)} /></div>
          <Button className="w-full mt-4" onClick={saveAsset} disabled={!form.name || !form.asset_category}>Save</Button>
        </div>
      </SlideOver>

      {/* Target Add/Edit Slide-over */}
      <SlideOver open={targetSlideOpen} onClose={() => { setTargetSlideOpen(false); setEditTarget(null); }} title={editTarget ? "Edit Target" : "Add Target"}>
        <div className="space-y-3">
          <div>
            <Label>Scope</Label>
            <Select value={targetForm.scope || "__unassigned__"} onValueChange={v => setTargetForm(p => ({ ...p, scope: v === "__unassigned__" ? null : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__" disabled>Select</SelectItem>
                <SelectItem value="scope_1">Scope 1</SelectItem>
                <SelectItem value="scope_2">Scope 2</SelectItem>
                <SelectItem value="scope_3">Scope 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Baseline Year</Label><Input type="number" value={targetForm.baseline_year ?? ""} onChange={e => setTargetForm(p => ({ ...p, baseline_year: Number(e.target.value) }))} /></div>
            <div><Label>Baseline tCO₂e</Label><Input type="number" value={targetForm.baseline_co2e ?? ""} onChange={e => setTargetForm(p => ({ ...p, baseline_co2e: Number(e.target.value) }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Target Year</Label><Input type="number" value={targetForm.target_year ?? ""} onChange={e => setTargetForm(p => ({ ...p, target_year: Number(e.target.value) }))} /></div>
            <div><Label>Target Reduction %</Label><Input type="number" value={targetForm.target_reduction_pct ?? ""} onChange={e => setTargetForm(p => ({ ...p, target_reduction_pct: Number(e.target.value) }))} /></div>
          </div>
          <div><Label>Methodology</Label><Input value={targetForm.methodology || ""} onChange={e => setTargetForm(p => ({ ...p, methodology: e.target.value }))} /></div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!targetForm.science_based} onChange={e => setTargetForm(p => ({ ...p, science_based: e.target.checked }))} />
              Science-Based
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!targetForm.sbti_approved} onChange={e => setTargetForm(p => ({ ...p, sbti_approved: e.target.checked }))} />
              SBTi Approved
            </label>
          </div>
          <Button className="w-full mt-4" onClick={saveTarget}>Save</Button>
        </div>
      </SlideOver>

      <ConfirmDialog open={!!deleteId} onConfirm={deleteAsset} onCancel={() => setDeleteId(null)} />
      <ConfirmDialog open={!!deleteTargetId} onConfirm={deleteTarget} onCancel={() => setDeleteTargetId(null)} />
    </div>
  );
}

// Asset table with adaptive columns
function AssetTable({ assets, tab, canEdit, canDelete, onEdit, onDelete }: {
  assets: Asset[];
  tab: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
}) {
  const catLabel = (c: string | null) => {
    if (!c) return "—";
    return c.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
  };

  if (tab === "facility") {
    return (
      <Table>
        <TableHeader><TableRow>
          <TableHead>Name</TableHead><TableHead>Sub-Type</TableHead><TableHead>City</TableHead><TableHead>Country</TableHead>
          <TableHead>GFA (m²)</TableHead><TableHead>Year Built</TableHead><TableHead>Certification</TableHead><TableHead>Status</TableHead>
          <TableHead className="w-20">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {assets.map(a => (
            <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50">
              <TableCell className="font-medium"><Link to="/assets/$id" params={{ id: a.id }} className="text-primary hover:underline">{a.name}</Link></TableCell>
              <TableCell>{a.asset_type || "—"}</TableCell>
              <TableCell>{a.city || "—"}</TableCell>
              <TableCell>{a.country || "—"}</TableCell>
              <TableCell>{a.gross_floor_area_m2?.toLocaleString() ?? "—"}</TableCell>
              <TableCell>{a.year_built ?? "—"}</TableCell>
              <TableCell>{a.certification || "—"}</TableCell>
              <TableCell><Badge variant="outline">{a.status || "active"}</Badge></TableCell>
              <TableCell><ActionBtns a={a} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} /></TableCell>
            </TableRow>
          ))}
          {!assets.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No facilities</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  if (tab === "vehicle") {
    return (
      <Table>
        <TableHeader><TableRow>
          <TableHead>Name</TableHead><TableHead>Sub-Type</TableHead><TableHead>Make/Model</TableHead><TableHead>Status</TableHead>
          <TableHead className="w-20">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {assets.map(a => (
            <TableRow key={a.id}>
              <TableCell className="font-medium"><Link to="/assets/$id" params={{ id: a.id }} className="text-primary hover:underline">{a.name}</Link></TableCell>
              <TableCell>{a.asset_type || "—"}</TableCell>
              <TableCell>{a.asset_type || "—"}</TableCell>
              <TableCell><Badge variant="outline">{a.status || "active"}</Badge></TableCell>
              <TableCell><ActionBtns a={a} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} /></TableCell>
            </TableRow>
          ))}
          {!assets.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No vehicles</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  if (tab === "capital_good") {
    return (
      <Table>
        <TableHeader><TableRow>
          <TableHead>Name</TableHead><TableHead>Sub-Type</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead>
          <TableHead className="w-20">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {assets.map(a => (
            <TableRow key={a.id}>
              <TableCell className="font-medium"><Link to="/assets/$id" params={{ id: a.id }} className="text-primary hover:underline">{a.name}</Link></TableCell>
              <TableCell>{a.asset_type || "—"}</TableCell>
              <TableCell className="max-w-[200px] truncate">{a.notes || "—"}</TableCell>
              <TableCell><Badge variant="outline">{a.status || "active"}</Badge></TableCell>
              <TableCell><ActionBtns a={a} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} /></TableCell>
            </TableRow>
          ))}
          {!assets.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No capital goods</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  if (tab === "land") {
    return (
      <Table>
        <TableHeader><TableRow>
          <TableHead>Name</TableHead><TableHead>Location</TableHead><TableHead>Area (m²)</TableHead><TableHead>Status</TableHead>
          <TableHead className="w-20">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {assets.map(a => (
            <TableRow key={a.id}>
              <TableCell className="font-medium"><Link to="/assets/$id" params={{ id: a.id }} className="text-primary hover:underline">{a.name}</Link></TableCell>
              <TableCell>{[a.city, a.country].filter(Boolean).join(", ") || "—"}</TableCell>
              <TableCell>{a.gross_floor_area_m2?.toLocaleString() ?? "—"}</TableCell>
              <TableCell><Badge variant="outline">{a.status || "active"}</Badge></TableCell>
              <TableCell><ActionBtns a={a} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} /></TableCell>
            </TableRow>
          ))}
          {!assets.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No land assets</TableCell></TableRow>}
        </TableBody>
      </Table>
    );
  }

  // All tab
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Sub-Type</TableHead><TableHead>City/Country</TableHead>
        <TableHead>Status</TableHead><TableHead className="w-20">Actions</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {assets.map(a => (
          <TableRow key={a.id}>
            <TableCell className="font-medium"><Link to="/assets/$id" params={{ id: a.id }} className="text-primary hover:underline">{a.name}</Link></TableCell>
            <TableCell><Badge variant="outline">{catLabel(a.asset_category)}</Badge></TableCell>
            <TableCell>{a.asset_type || "—"}</TableCell>
            <TableCell>{[a.city, a.country].filter(Boolean).join(", ") || "—"}</TableCell>
            <TableCell><Badge variant="outline">{a.status || "active"}</Badge></TableCell>
            <TableCell><ActionBtns a={a} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} /></TableCell>
          </TableRow>
        ))}
        {!assets.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No assets yet</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

function ActionBtns({ a, canEdit, canDelete, onEdit, onDelete }: {
  a: Asset; canEdit: boolean; canDelete: boolean;
  onEdit: (a: Asset) => void; onDelete: (id: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {canEdit && <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); onEdit(a); }}><Pencil className="h-3.5 w-3.5" /></Button>}
      {canDelete && <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); onDelete(a.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
    </div>
  );
}
