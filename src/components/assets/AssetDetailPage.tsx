import { useState, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlideOver } from "@/components/shared/SlideOver";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import type { Asset, EnergyConsumption, Emission, EmissionScope } from "@/types/database";

const SCOPE3_CATEGORIES = [
  "Purchased Goods & Services", "Capital Goods", "Fuel- & Energy-Related",
  "Upstream Transport", "Waste", "Business Travel", "Employee Commuting",
  "Upstream Leased Assets", "Downstream Transport", "Processing of Sold Products",
  "Use of Sold Products", "End-of-Life Treatment", "Downstream Leased Assets",
  "Franchises", "Investments",
];

interface Props {
  assetId: string;
}

export default function AssetDetailPage({ assetId }: Props) {
  const { clientId, role } = useAuth();
  const canEdit = role === "admin" || role === "contributor";
  const canDelete = role === "admin";

  const [asset, setAsset] = useState<Asset | null>(null);
  const [energy, setEnergy] = useState<EnergyConsumption[]>([]);
  const [emissions, setEmissions] = useState<Emission[]>([]);
  const [linkedInits, setLinkedInits] = useState<any[]>([]);

  // Slide-over state
  const [energySlide, setEnergySlide] = useState(false);
  const [editEnergy, setEditEnergy] = useState<EnergyConsumption | null>(null);
  const [energyForm, setEnergyForm] = useState<Record<string, any>>({});

  const [emissionSlide, setEmissionSlide] = useState(false);
  const [editEmission, setEditEmission] = useState<Emission | null>(null);
  const [emissionForm, setEmissionForm] = useState<Record<string, any>>({});

  const [deleteEnergyId, setDeleteEnergyId] = useState<string | null>(null);
  const [deleteEmissionId, setDeleteEmissionId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    const [{ data: a }, { data: en }, { data: em }] = await Promise.all([
      supabase.from("assets").select("*").eq("id", assetId).single(),
      supabase.from("energy_consumption").select("*").eq("asset_id", assetId).order("period_start", { ascending: false }),
      supabase.from("emissions").select("*").eq("asset_id", assetId).order("reporting_year", { ascending: false }),
    ]);
    setAsset(a as Asset | null);
    setEnergy((en as EnergyConsumption[]) || []);
    setEmissions((em as Emission[]) || []);

    // Linked initiatives
    const { data: links } = await supabase
      .from("initiative_assets")
      .select("initiative_id")
      .eq("asset_id", assetId);
    if (links && links.length > 0) {
      const initIds = links.map((l: any) => l.initiative_id);
      const { data: inits } = await supabase.from("initiatives").select("id, title, wsjf_score").in("id", initIds);
      // Get LBC numbers
      const { data: lbcs } = await supabase.from("lean_business_cases").select("initiative_id, lbc_number").in("initiative_id", initIds);
      const lbcMap = new Map((lbcs || []).map((l: any) => [l.initiative_id, l.lbc_number]));
      setLinkedInits((inits || []).map((i: any) => ({ ...i, lbc_number: lbcMap.get(i.id) })));
    } else {
      setLinkedInits([]);
    }
  }, [clientId, assetId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Energy CRUD
  async function saveEnergy() {
    const payload = { ...energyForm };
    delete payload.id; delete payload.client_id; delete payload.created_at; delete payload.updated_at;
    if (editEnergy) {
      await supabase.from("energy_consumption").update(payload).eq("id", editEnergy.id);
    } else {
      await supabase.from("energy_consumption").insert({ ...payload, asset_id: assetId, client_id: clientId });
    }
    setEnergySlide(false); setEditEnergy(null); setEnergyForm({}); fetchData();
  }

  async function deleteEnergy() {
    if (!deleteEnergyId) return;
    await supabase.from("energy_consumption").delete().eq("id", deleteEnergyId);
    setDeleteEnergyId(null); fetchData();
  }

  // Emission CRUD
  async function saveEmission() {
    const payload = { ...emissionForm };
    delete payload.id; delete payload.client_id; delete payload.created_at; delete payload.updated_at;
    if (editEmission) {
      await supabase.from("emissions").update(payload).eq("id", editEmission.id);
    } else {
      await supabase.from("emissions").insert({ ...payload, asset_id: assetId, client_id: clientId });
    }
    setEmissionSlide(false); setEditEmission(null); setEmissionForm({}); fetchData();
  }

  async function deleteEmission() {
    if (!deleteEmissionId) return;
    await supabase.from("emissions").delete().eq("id", deleteEmissionId);
    setDeleteEmissionId(null); fetchData();
  }

  if (!asset) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full" /></div>;
  }

  const isFacility = asset.asset_category === "facility";
  const catLabel = asset.asset_category?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "—";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/assets"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-primary">{asset.name}</h1>
          <p className="text-sm text-muted-foreground">{catLabel}</p>
        </div>
      </div>

      {/* Info Card */}
      <Card><CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><span className="text-muted-foreground">Category:</span> {catLabel}</div>
        <div><span className="text-muted-foreground">Sub-Type:</span> {asset.asset_type || "—"}</div>
        <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{asset.status || "active"}</Badge></div>
        {asset.city && <div><span className="text-muted-foreground">City:</span> {asset.city}</div>}
        {asset.country && <div><span className="text-muted-foreground">Country:</span> {asset.country}</div>}
        {asset.gross_floor_area_m2 && <div><span className="text-muted-foreground">GFA:</span> {asset.gross_floor_area_m2.toLocaleString()} m²</div>}
        {asset.certification && <div><span className="text-muted-foreground">Certification:</span> {asset.certification}</div>}
        {asset.year_built && <div><span className="text-muted-foreground">Year Built:</span> {asset.year_built}</div>}
        {asset.notes && <div className="col-span-full"><span className="text-muted-foreground">Notes:</span> {asset.notes}</div>}
      </CardContent></Card>

      {/* Energy Consumption — Facilities only */}
      {isFacility && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-primary">Energy Consumption</h2>
            {canEdit && (
              <Button size="sm" onClick={() => { setEditEnergy(null); setEnergyForm({}); setEnergySlide(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            )}
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fuel Type</TableHead><TableHead>Period Start</TableHead><TableHead>Period End</TableHead>
              <TableHead>Quantity</TableHead><TableHead>Unit</TableHead><TableHead>Cost</TableHead>
              {canEdit && <TableHead className="w-20">Actions</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {energy.map(e => (
                <TableRow key={e.id}>
                  <TableCell>{e.fuel_type}</TableCell>
                  <TableCell>{e.period_start}</TableCell>
                  <TableCell>{e.period_end}</TableCell>
                  <TableCell>{e.quantity.toLocaleString()}</TableCell>
                  <TableCell>{e.unit}</TableCell>
                  <TableCell>{e.cost != null ? `$${e.cost.toLocaleString()}` : "—"}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditEnergy(e);
                          const { id, client_id, created_at, updated_at, asset_id, ...rest } = e as any;
                          setEnergyForm(rest);
                          setEnergySlide(true);
                        }}><Pencil className="h-3.5 w-3.5" /></Button>
                        {canDelete && <Button variant="ghost" size="icon" onClick={() => setDeleteEnergyId(e.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!energy.length && <TableRow><TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground py-4">No energy records</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Emissions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-primary">Emissions</h2>
          {canEdit && (
            <Button size="sm" onClick={() => { setEditEmission(null); setEmissionForm({}); setEmissionSlide(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          )}
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Scope</TableHead><TableHead>Category</TableHead><TableHead>Year</TableHead>
            <TableHead>tCO₂e</TableHead><TableHead>Factor</TableHead><TableHead>Source</TableHead>
            <TableHead>Verified</TableHead>
            {canEdit && <TableHead className="w-20">Actions</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {emissions.map(e => (
              <TableRow key={e.id}>
                <TableCell>{e.scope.replace(/_/g, " ").toUpperCase()}</TableCell>
                <TableCell>{e.scope === "scope_3" ? (e.scope_3_category || "—") : "—"}</TableCell>
                <TableCell>{e.reporting_year}</TableCell>
                <TableCell>{e.co2e_tonnes.toLocaleString()}</TableCell>
                <TableCell>{e.emission_factor ?? "—"}</TableCell>
                <TableCell>{e.source || "—"}</TableCell>
                <TableCell>{e.verified ? "✓" : "—"}</TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditEmission(e);
                        const { id, client_id, created_at, updated_at, asset_id, ...rest } = e as any;
                        setEmissionForm(rest);
                        setEmissionSlide(true);
                      }}><Pencil className="h-3.5 w-3.5" /></Button>
                      {canDelete && <Button variant="ghost" size="icon" onClick={() => setDeleteEmissionId(e.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!emissions.length && <TableRow><TableCell colSpan={canEdit ? 8 : 7} className="text-center text-muted-foreground py-4">No emissions records</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Linked Initiatives */}
      {linkedInits.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-primary mb-2">Linked Initiatives</h2>
          <Table>
            <TableHeader><TableRow>
              <TableHead>LBC No.</TableHead><TableHead>Initiative Name</TableHead><TableHead>WSJF Score</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {linkedInits.map(i => (
                <TableRow key={i.id}>
                  <TableCell>{i.lbc_number ? `LBC-${String(i.lbc_number).padStart(3, "0")}` : "—"}</TableCell>
                  <TableCell>
                    <Link to="/lbc/$id" params={{ id: i.id }} className="text-primary hover:underline">{i.title}</Link>
                  </TableCell>
                  <TableCell>{i.wsjf_score?.toFixed(2) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Energy Slide-over */}
      <SlideOver open={energySlide} onClose={() => { setEnergySlide(false); setEditEnergy(null); }} title={editEnergy ? "Edit Energy Record" : "Add Energy Record"}>
        <div className="space-y-3">
          <div><Label>Fuel Type</Label><Input value={energyForm.fuel_type || ""} onChange={e => setEnergyForm(p => ({ ...p, fuel_type: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Period Start</Label><Input type="date" value={energyForm.period_start || ""} onChange={e => setEnergyForm(p => ({ ...p, period_start: e.target.value }))} /></div>
            <div><Label>Period End</Label><Input type="date" value={energyForm.period_end || ""} onChange={e => setEnergyForm(p => ({ ...p, period_end: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Quantity</Label><Input type="number" value={energyForm.quantity ?? ""} onChange={e => setEnergyForm(p => ({ ...p, quantity: Number(e.target.value) }))} /></div>
            <div><Label>Unit</Label><Input value={energyForm.unit || ""} onChange={e => setEnergyForm(p => ({ ...p, unit: e.target.value }))} /></div>
          </div>
          <div><Label>Cost ($)</Label><Input type="number" value={energyForm.cost ?? ""} onChange={e => setEnergyForm(p => ({ ...p, cost: e.target.value ? Number(e.target.value) : null }))} /></div>
          <Button className="w-full mt-4" onClick={saveEnergy}>Save</Button>
        </div>
      </SlideOver>

      {/* Emission Slide-over */}
      <SlideOver open={emissionSlide} onClose={() => { setEmissionSlide(false); setEditEmission(null); }} title={editEmission ? "Edit Emission" : "Add Emission"}>
        <div className="space-y-3">
          <div>
            <Label>Scope</Label>
            <Select value={emissionForm.scope || "__unassigned__"} onValueChange={v => setEmissionForm(p => ({ ...p, scope: v === "__unassigned__" ? null : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__" disabled>Select</SelectItem>
                <SelectItem value="scope_1">Scope 1</SelectItem>
                <SelectItem value="scope_2">Scope 2</SelectItem>
                <SelectItem value="scope_3">Scope 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {emissionForm.scope === "scope_3" && (
            <div>
              <Label>Scope 3 Category</Label>
              <Select value={emissionForm.scope_3_category || "__unassigned__"} onValueChange={v => setEmissionForm(p => ({ ...p, scope_3_category: v === "__unassigned__" ? null : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">None</SelectItem>
                  {SCOPE3_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Reporting Year</Label><Input type="number" value={emissionForm.reporting_year ?? ""} onChange={e => setEmissionForm(p => ({ ...p, reporting_year: Number(e.target.value) }))} /></div>
          <div><Label>tCO₂e</Label><Input type="number" step="0.01" value={emissionForm.co2e_tonnes ?? ""} onChange={e => setEmissionForm(p => ({ ...p, co2e_tonnes: Number(e.target.value) }))} /></div>
          <div><Label>Emission Factor</Label><Input type="number" step="any" value={emissionForm.emission_factor ?? ""} onChange={e => setEmissionForm(p => ({ ...p, emission_factor: e.target.value ? Number(e.target.value) : null }))} /></div>
          <div><Label>Source</Label><Input value={emissionForm.source || ""} onChange={e => setEmissionForm(p => ({ ...p, source: e.target.value }))} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!emissionForm.verified} onChange={e => setEmissionForm(p => ({ ...p, verified: e.target.checked }))} />
            Verified
          </label>
          <Button className="w-full mt-4" onClick={saveEmission}>Save</Button>
        </div>
      </SlideOver>

      <ConfirmDialog open={!!deleteEnergyId} onConfirm={deleteEnergy} onCancel={() => setDeleteEnergyId(null)} />
      <ConfirmDialog open={!!deleteEmissionId} onConfirm={deleteEmission} onCancel={() => setDeleteEmissionId(null)} />
    </div>
  );
}
