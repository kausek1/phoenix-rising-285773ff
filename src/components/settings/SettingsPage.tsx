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
  const { role, clientId } = useAuth();

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

        <TabsContent value="wsjf"><WSJFConfigSection clientId={clientId} /></TabsContent>
        <TabsContent value="kanban"><KanbanWIPSection clientId={clientId} /></TabsContent>
        <TabsContent value="sprints"><SprintSection clientId={clientId} /></TabsContent>
        <TabsContent value="users"><UserSection clientId={clientId} /></TabsContent>
        <TabsContent value="client"><ClientSection clientId={clientId} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────── 1. WSJF Configuration ───────── */
function WSJFConfigSection({ clientId }: { clientId: string | null }) {
  const [riskWeights, setRiskWeights] = useState<Record<RiskLevel, number>>({ ...DEFAULT_RISK_WEIGHTS });
  const [alignmentPoints, setAlignmentPoints] = useState<Record<string, number>>({ ...DEFAULT_ALIGNMENT_POINTS });
  const [alignmentCap, setAlignmentCap] = useState(DEFAULT_ALIGNMENT_CAP);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const { data } = await supabase
        .from("wsjf_config")
        .select("*")
        .eq("client_id", clientId);
      if (data && data.length > 0) {
        const weights: Record<RiskLevel, number> = { ...DEFAULT_RISK_WEIGHTS };
        for (const row of data) {
          weights[row.risk_level as RiskLevel] = row.risk_weight;
          if (row.alignment_points) setAlignmentPoints(row.alignment_points as Record<string, number>);
          if (row.alignment_cap != null) setAlignmentCap(row.alignment_cap as number);
        }
        setRiskWeights(weights);
      }
      setLoaded(true);
    })();
  }, [clientId]);

  const handleSave = async () => {
    if (!clientId) return;
    setSaving(true);
    try {
      for (const rl of RISK_LEVELS) {
        const payload = {
          client_id: clientId,
          risk_level: rl.key,
          risk_weight: riskWeights[rl.key],
          alignment_points: alignmentPoints,
          alignment_cap: alignmentCap,
        };
        await supabase.from("wsjf_config").upsert(payload, { onConflict: "client_id,risk_level" });
      }
      toast.success("WSJF configuration saved");
    } catch {
      toast.error("Failed to save WSJF configuration");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="text-muted-foreground p-4">Loading…</p>;

  return (
    <div className="space-y-6 mt-4">
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
