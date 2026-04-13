import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlideOver } from "@/components/shared/SlideOver";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Plus, Pencil, Trash2, User, Download } from "lucide-react";
import CorrelationEditor from "./CorrelationEditor";
import { exportXMatrix } from "./XMatrixExport";
import type { XMatrixGoal, XMatrixObjective, XMatrixPriority, XMatrixKPI, XMatrixOwner, Profile } from "@/types/database";

type EntityTab = "goals" | "objectives" | "priorities" | "kpis" | "owners";

const TAB_TABLE: Record<EntityTab, string> = {
  goals: "xmatrix_long_term_goals",
  objectives: "xmatrix_annual_objectives",
  priorities: "xmatrix_improvement_priorities",
  kpis: "xmatrix_kpis",
  owners: "xmatrix_owners",
};

const STATUS_OPTIONS = ["Active", "Completed", "Deferred"];

export default function XMatrixModule() {
  const { clientId, role, client } = useAuth();
  const canEdit = role === "admin" || role === "contributor";
  const canDelete = role === "admin";

  const [activeTab, setActiveTab] = useState<EntityTab>("goals");
  const [goals, setGoals] = useState<XMatrixGoal[]>([]);
  const [objectives, setObjectives] = useState<XMatrixObjective[]>([]);
  const [priorities, setPriorities] = useState<XMatrixPriority[]>([]);
  const [kpis, setKpis] = useState<XMatrixKPI[]>([]);
  const [owners, setOwners] = useState<XMatrixOwner[]>([]);

  const [slideOpen, setSlideOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [profileSearch, setProfileSearch] = useState("");
  const [profileResults, setProfileResults] = useState<Profile[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!clientId) return;
    const [g, o, p, k, ow] = await Promise.all([
      supabase.from("xmatrix_long_term_goals").select("*").eq("client_id", clientId),
      supabase.from("xmatrix_annual_objectives").select("*").eq("client_id", clientId),
      supabase.from("xmatrix_improvement_priorities").select("*").eq("client_id", clientId),
      supabase.from("xmatrix_kpis").select("*").eq("client_id", clientId),
      supabase.from("xmatrix_owners").select("*").eq("client_id", clientId),
    ]);
    setGoals((g.data as XMatrixGoal[]) || []);
    setObjectives((o.data as XMatrixObjective[]) || []);
    setPriorities((p.data as XMatrixPriority[]) || []);
    setKpis((k.data as XMatrixKPI[]) || []);
    setOwners((ow.data as XMatrixOwner[]) || []);
  }, [clientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openAdd() {
    setEditId(null);
    setForm({});
    setSlideOpen(true);
  }

  function openEdit(item: any) {
    setEditId(item.id);
    const { id, client_id, created_at, updated_at, ...rest } = item;
    setForm(rest);
    setSlideOpen(true);
  }

  async function handleSave() {
    const table = TAB_TABLE[activeTab];
    let result;
    if (editId) {
      result = await supabase.from(table).update(form).eq("id", editId);
    } else {
      result = await supabase.from(table).insert({ ...form, client_id: clientId });
    }
    if (result.error) {
      console.error(`[XMatrix] Save error on ${table}:`, result.error);
      return;
    }
    console.log(`[XMatrix] Save success on ${table}`);
    setSlideOpen(false);
    await fetchAll();
  }

  async function handleDelete() {
    if (!deleteId) return;
    const table = TAB_TABLE[activeTab];
    const { error } = await supabase.from(table).delete().eq("id", deleteId);
    if (error) {
      console.error(`[XMatrix] Delete error on ${table}:`, error);
      return;
    }
    console.log(`[XMatrix] Delete success on ${table}`);
    setDeleteId(null);
    await fetchAll();
  }

  function searchProfiles(query: string) {
    setProfileSearch(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setProfileResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles").select("*")
        .eq("client_id", clientId!)
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(5);
      setProfileResults((data as Profile[]) || []);
    }, 300);
  }

  function selectProfile(p: Profile) {
    setForm({ ...form, name: p.full_name, role_title: p.role, profile_id: p.id });
    setProfileResults([]);
    setProfileSearch("");
  }

  const ownerName = (id: string | null) => owners.find(o => o.id === id)?.name ?? "—";

  function Actions({ item }: { item: any }) {
    return (
      <div className="flex gap-1">
        {canEdit && (
          <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button variant="ghost" size="icon" onClick={() => setDeleteId(item.id)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </div>
    );
  }

  function renderTable() {
    switch (activeTab) {
      case "goals":
        return (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Title</TableHead><TableHead>Target Year</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-24">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {goals.map(g => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.title}</TableCell>
                  <TableCell>{g.target_year}</TableCell>
                  <TableCell><Badge variant="outline">{g.status}</Badge></TableCell>
                  <TableCell><Actions item={g} /></TableCell>
                </TableRow>
              ))}
              {!goals.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No goals yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        );
      case "objectives":
        return (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Title</TableHead><TableHead>Fiscal Year</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-24">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {objectives.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.title}</TableCell>
                  <TableCell>{o.fiscal_year}</TableCell>
                  <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                  <TableCell><Actions item={o} /></TableCell>
                </TableRow>
              ))}
              {!objectives.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No objectives yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        );
      case "priorities":
        return (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Title</TableHead><TableHead>Owner</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-24">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {priorities.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell>{ownerName(p.owner_id)}</TableCell>
                  <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                  <TableCell><Actions item={p} /></TableCell>
                </TableRow>
              ))}
              {!priorities.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No priorities yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        );
      case "kpis":
        return (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Unit</TableHead>
              <TableHead>Target</TableHead><TableHead>Current</TableHead>
              <TableHead>Owner</TableHead><TableHead className="w-24">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {kpis.map(k => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>{k.unit}</TableCell>
                  <TableCell>{k.target_value ?? "—"}</TableCell>
                  <TableCell>{k.current_value ?? "—"}</TableCell>
                  <TableCell>{ownerName(k.owner_id)}</TableCell>
                  <TableCell><Actions item={k} /></TableCell>
                </TableRow>
              ))}
              {!kpis.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No KPIs yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        );
      case "owners":
        return (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Role Title</TableHead>
              <TableHead>Linked Profile</TableHead><TableHead className="w-24">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {owners.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    {o.profile_id && <User className="h-3.5 w-3.5 text-accent" />}
                    {o.name}
                  </TableCell>
                  <TableCell>{o.role_title}</TableCell>
                  <TableCell>{o.profile_id ? "Linked" : "—"}</TableCell>
                  <TableCell><Actions item={o} /></TableCell>
                </TableRow>
              ))}
              {!owners.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No owners yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        );
    }
  }

  function renderForm() {
    const set = (key: string, val: any) => setForm({ ...form, [key]: val });
    switch (activeTab) {
      case "goals":
        return (<>
          <div><Label>Title</Label><Input value={form.title || ""} onChange={e => set("title", e.target.value)} /></div>
          <div><Label>Description</Label><Textarea value={form.description || ""} onChange={e => set("description", e.target.value)} rows={3} /></div>
          <div><Label>Target Year</Label><Input type="number" value={form.target_year || ""} onChange={e => set("target_year", parseInt(e.target.value))} /></div>
          <div><Label>Status</Label>
            <Select value={form.status || "Active"} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </>);
      case "objectives":
        return (<>
          <div><Label>Title</Label><Input value={form.title || ""} onChange={e => set("title", e.target.value)} /></div>
          <div><Label>Description</Label><Textarea value={form.description || ""} onChange={e => set("description", e.target.value)} rows={3} /></div>
          <div><Label>Fiscal Year</Label><Input value={form.fiscal_year || ""} onChange={e => set("fiscal_year", e.target.value)} /></div>
          <div><Label>Status</Label>
            <Select value={form.status || "Active"} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </>);
      case "priorities":
        return (<>
          <div><Label>Title</Label><Input value={form.title || ""} onChange={e => set("title", e.target.value)} /></div>
          <div><Label>Description</Label><Textarea value={form.description || ""} onChange={e => set("description", e.target.value)} rows={3} /></div>
          <div><Label>Owner</Label>
            <Select value={form.owner_id || "__unassigned__"} onValueChange={v => set("owner_id", v === "__unassigned__" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Status</Label>
            <Select value={form.status || "Active"} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </>);
      case "kpis":
        return (<>
          <div><Label>Name</Label><Input value={form.name || ""} onChange={e => set("name", e.target.value)} /></div>
          <div><Label>Description</Label><Textarea value={form.description || ""} onChange={e => set("description", e.target.value)} rows={3} /></div>
          <div><Label>Unit</Label><Input value={form.unit || ""} onChange={e => set("unit", e.target.value)} placeholder='e.g., kWh, tCO2e, %' /></div>
          <div><Label>Target Value</Label><Input type="number" value={form.target_value ?? ""} onChange={e => set("target_value", e.target.value ? parseFloat(e.target.value) : null)} /></div>
          <div><Label>Current Value</Label><Input type="number" value={form.current_value ?? ""} onChange={e => set("current_value", e.target.value ? parseFloat(e.target.value) : null)} /></div>
          <div><Label>Owner</Label>
            <Select value={form.owner_id || "__unassigned__"} onValueChange={v => set("owner_id", v === "__unassigned__" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </>);
      case "owners":
        return (<>
          <div>
            <Label>Search Existing Users</Label>
            <Input placeholder="Search by name or email…" value={profileSearch} onChange={e => searchProfiles(e.target.value)} />
            {profileResults.length > 0 && (
              <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                {profileResults.map(p => (
                  <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => selectProfile(p)}>
                    {p.full_name} — {p.email}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div><Label>Name</Label><Input value={form.name || ""} onChange={e => set("name", e.target.value)} /></div>
          <div><Label>Role Title</Label><Input value={form.role_title || ""} onChange={e => set("role_title", e.target.value)} /></div>
        </>);
    }
  }

  const tabLabel: Record<EntityTab, string> = {
    goals: "Long-term Goals", objectives: "Annual Objectives",
    priorities: "Improvement Priorities", kpis: "KPIs", owners: "Owners",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">X-Matrix</h1>
        <Button variant="outline" size="sm" onClick={() => exportXMatrix(client?.name ?? "Client", goals, objectives, priorities, kpis, owners)}>
          <Download className="h-4 w-4 mr-1" /> Export X-Matrix
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as EntityTab)}>
        <TabsList>
          {(Object.keys(tabLabel) as EntityTab[]).map(t => (
            <TabsTrigger key={t} value={t}>{tabLabel[t]}</TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(tabLabel) as EntityTab[]).map(t => (
          <TabsContent key={t} value={t}>
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                className="xmatrix-add-button inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={openAdd}
              >
                <Plus className="h-4 w-4" />
                <span>{{
                  goals: "Add Goal",
                  objectives: "Add Objective",
                  priorities: "Add Priority",
                  kpis: "Add KPI",
                  owners: "Add Owner",
                }[t]}</span>
              </button>
            </div>
            {renderTable()}
          </TabsContent>
        ))}
      </Tabs>

      <CorrelationEditor
        clientId={clientId}
        goals={goals} objectives={objectives}
        priorities={priorities} kpis={kpis} owners={owners}
        canEdit={canEdit}
      />

      <SlideOver open={slideOpen} onClose={() => setSlideOpen(false)} title={editId ? `Edit ${tabLabel[activeTab]}` : `Add ${tabLabel[activeTab]}`}>
        {renderForm()}
        <div className="flex gap-3 mt-4">
          <Button variant="outline" className="flex-1" onClick={() => setSlideOpen(false)}>Cancel</Button>
          <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave}>Save</Button>
        </div>
      </SlideOver>

      <ConfirmDialog
        open={!!deleteId}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        title="Delete item?"
        description="This will permanently remove this record."
      />
    </div>
  );
}
