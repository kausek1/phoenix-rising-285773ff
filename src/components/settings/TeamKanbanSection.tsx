import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Save, ArrowLeft, X } from "lucide-react";
import type { UserRole } from "@/types/database";

type Mode = { kind: "list" } | { kind: "form"; teamId: string | null };

interface KanbanTeam {
  id: string;
  client_id: string;
  initiative_id: string;
  team_name: string;
  team_coach: string | null;
  product_owner: string | null;
  comments: string | null;
}

interface InitiativeOpt {
  id: string;
  title: string;
  display_id: number | null;
}

interface TeamMemberRow {
  id: string | null;
  full_name: string;
  function_role: string;
  initials: string;
  percent_dedicated: number;
}

interface FeatureLite {
  id: string;
  feature_type: "mvp" | "post_mvp";
  title: string;
  acceptance_criteria: string | null;
  sort_order: number | null;
}

interface MetricLite {
  id: string;
  metric_name: string;
  metric_category: string | null;
  metric_type: string;
  baseline_value: number | null;
  baseline_unit: string | null;
  target_value: number | null;
  target_unit: string | null;
}

const WIP_DEFAULTS = { define: 3, build: 5, test: 3 };

function padLBC(displayId: number | null | undefined): string {
  if (displayId == null) return "LBC-—";
  return "LBC-" + String(displayId).padStart(3, "0");
}

export default function TeamKanbanSection({
  clientId,
  role,
}: {
  clientId: string | null;
  role: UserRole | null;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const isAdmin = role === "admin";

  if (mode.kind === "form") {
    return (
      <TeamForm
        clientId={clientId}
        teamId={mode.teamId}
        isAdmin={isAdmin}
        onBack={() => setMode({ kind: "list" })}
      />
    );
  }
  return (
    <TeamList
      clientId={clientId}
      isAdmin={isAdmin}
      onAdd={() => setMode({ kind: "form", teamId: null })}
      onEdit={(id) => setMode({ kind: "form", teamId: id })}
    />
  );
}

/* ───────── List View ───────── */
function TeamList({
  clientId,
  isAdmin,
  onAdd,
  onEdit,
}: {
  clientId: string | null;
  isAdmin: boolean;
  onAdd: () => void;
  onEdit: (id: string) => void;
}) {
  const [teams, setTeams] = useState<
    Array<KanbanTeam & { initiative: { title: string; display_id: number | null } | null }>
  >([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: tData, error: tErr } = await supabase
        .from("kanban_teams")
        .select("id, client_id, initiative_id, team_name, team_coach, product_owner, comments, initiatives(title, display_id)")
        .eq("client_id", clientId)
        .order("team_name");
      if (tErr) throw tErr;
      const mapped = (tData ?? []).map((row: any) => ({
        ...row,
        initiative: row.initiatives
          ? { title: row.initiatives.title, display_id: row.initiatives.display_id }
          : null,
      }));
      setTeams(mapped);

      const { data: allInit, error: iErr } = await supabase
        .from("initiatives")
        .select("id")
        .eq("client_id", clientId);
      if (iErr) throw iErr;
      const assigned = new Set(mapped.map((t) => t.initiative_id));
      const unassigned = (allInit ?? []).filter((r: any) => !assigned.has(r.id)).length;
      setUnassignedCount(unassigned);
    } catch (e: any) {
      console.error("[TeamKanban] load error:", e);
      setError(e?.message ?? "Failed to load Kanban teams");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("kanban_teams").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Kanban team deleted");
      setDeleteId(null);
      void load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to delete team");
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team Kanban Configuration</CardTitle>
            <CardDescription>Manage delivery teams and their kanban boards.</CardDescription>
          </div>
          {isAdmin && (
            <Button
              onClick={onAdd}
              disabled={unassignedCount === 0}
              title={unassignedCount === 0 ? "All initiatives already have a Kanban team" : ""}
              className="bg-[hsl(210,60%,28%)] hover:bg-[hsl(210,60%,22%)] text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Kanban Team
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground p-4">Loading…</p>
          ) : error ? (
            <div className="space-y-2 p-2">
              <p className="text-destructive">Failed to load teams: {error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
            </div>
          ) : teams.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No Kanban teams configured yet. Click "Add Kanban Team" to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">LBC ID</TableHead>
                  <TableHead>Team Name</TableHead>
                  <TableHead>Initiative</TableHead>
                  <TableHead>Team Coach</TableHead>
                  {isAdmin && <TableHead className="w-28 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">
                      {padLBC(t.initiative?.display_id)}
                    </TableCell>
                    <TableCell className="font-medium">{t.team_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.initiative?.title ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{t.team_coach ?? "—"}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => onEdit(t.id)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Kanban Team"
        description="This will remove the team, its members, and its WIP limits. This action cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}

/* ───────── Form (Add / Edit) ───────── */
function TeamForm({
  clientId,
  teamId,
  isAdmin,
  onBack,
}: {
  clientId: string | null;
  teamId: string | null;
  isAdmin: boolean;
  onBack: () => void;
}) {
  const isEdit = teamId !== null;
  const readOnly = !isAdmin;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Section 1
  const [initiativeId, setInitiativeId] = useState<string>("");
  const [teamName, setTeamName] = useState("");
  const [teamCoach, setTeamCoach] = useState("");
  const [productOwner, setProductOwner] = useState("");

  // Initiatives available
  const [initiativeOpts, setInitiativeOpts] = useState<InitiativeOpt[]>([]);
  const lockedInitiative = useMemo(
    () => initiativeOpts.find((i) => i.id === initiativeId) ?? null,
    [initiativeId, initiativeOpts],
  );

  // Section 2 — roster
  const [members, setMembers] = useState<TeamMemberRow[]>([
    { id: null, full_name: "", function_role: "", initials: "", percent_dedicated: 100 },
  ]);
  const [removedMemberIds, setRemovedMemberIds] = useState<string[]>([]);

  // Section 3 — features
  const [features, setFeatures] = useState<FeatureLite[]>([]);

  // Section 4 — metrics
  const [metrics, setMetrics] = useState<MetricLite[]>([]);

  // Section 5 — WIP
  const [wip, setWip] = useState<{ define: number; build: number; test: number }>({ ...WIP_DEFAULTS });

  // Section 6 — comments
  const [comments, setComments] = useState("");

  /* Load initial data */
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Load all client initiatives + already-assigned set
        const [{ data: allInit, error: iErr }, { data: assignedRows, error: aErr }] =
          await Promise.all([
            supabase
              .from("initiatives")
              .select("id, title, display_id")
              .eq("client_id", clientId)
              .order("display_id"),
            supabase.from("kanban_teams").select("initiative_id").eq("client_id", clientId),
          ]);
        if (iErr) throw iErr;
        if (aErr) throw aErr;

        const assigned = new Set((assignedRows ?? []).map((r: any) => r.initiative_id));

        let team: KanbanTeam | null = null;
        if (isEdit && teamId) {
          const { data: tData, error: tErr } = await supabase
            .from("kanban_teams")
            .select("*")
            .eq("id", teamId)
            .single();
          if (tErr) throw tErr;
          team = tData as KanbanTeam;
        }

        const opts: InitiativeOpt[] = (allInit ?? [])
          .filter((r: any) => !assigned.has(r.id) || r.id === team?.initiative_id)
          .map((r: any) => ({ id: r.id, title: r.title, display_id: r.display_id }));

        if (cancelled) return;
        setInitiativeOpts(opts);

        if (team) {
          setInitiativeId(team.initiative_id);
          setTeamName(team.team_name ?? "");
          setTeamCoach(team.team_coach ?? "");
          setProductOwner(team.product_owner ?? "");
          setComments(team.comments ?? "");

          // Members
          const { data: mData, error: mErr } = await supabase
            .from("team_members")
            .select("id, full_name, function_role, initials, percent_dedicated")
            .eq("team_id", teamId!)
            .order("full_name");
          if (mErr) throw mErr;
          if (!cancelled) {
            const list = (mData ?? []).map((r: any) => ({
              id: r.id as string,
              full_name: r.full_name ?? "",
              function_role: r.function_role ?? "",
              initials: r.initials ?? "",
              percent_dedicated: r.percent_dedicated ?? 100,
            }));
            setMembers(
              list.length > 0
                ? list
                : [{ id: null, full_name: "", function_role: "", initials: "", percent_dedicated: 100 }],
            );
          }

          // WIP
          const { data: wData, error: wErr } = await supabase
            .from("team_wip_limits")
            .select("stage, wip_limit")
            .eq("team_id", teamId!);
          if (wErr) throw wErr;
          if (!cancelled) {
            const next = { ...WIP_DEFAULTS };
            (wData ?? []).forEach((r: any) => {
              if (r.stage === "define" || r.stage === "build" || r.stage === "test") {
                next[r.stage as keyof typeof next] = r.wip_limit;
              }
            });
            setWip(next);
          }

          await loadFeaturesAndMetrics(team.initiative_id, cancelled);
        }
      } catch (e: any) {
        console.error("[TeamForm] load error:", e);
        if (!cancelled) setError(e?.message ?? "Failed to load team data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, teamId]);

  const loadFeaturesAndMetrics = async (initId: string, cancelled = false) => {
    if (!initId || !clientId) {
      setFeatures([]);
      setMetrics([]);
      return;
    }
    const [{ data: fData }, { data: mData }] = await Promise.all([
      supabase
        .from("features")
        .select("id, feature_type, title, acceptance_criteria, sort_order")
        .eq("client_id", clientId)
        .eq("initiative_id", initId)
        .order("feature_type")
        .order("sort_order"),
      supabase
        .from("initiative_metrics")
        .select("id, metric_name, metric_category, metric_type, baseline_value, baseline_unit, target_value, target_unit")
        .eq("client_id", clientId)
        .eq("initiative_id", initId)
        .order("metric_type"),
    ]);
    if (cancelled) return;
    setFeatures((fData as FeatureLite[]) ?? []);
    setMetrics((mData as MetricLite[]) ?? []);
  };

  // When initiative changes (Add mode), refresh features/metrics
  useEffect(() => {
    if (isEdit) return;
    if (!initiativeId) {
      setFeatures([]);
      setMetrics([]);
      return;
    }
    void loadFeaturesAndMetrics(initiativeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiativeId]);

  /* Member row handlers */
  const updateMember = (idx: number, patch: Partial<TeamMemberRow>) => {
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };
  const addMember = () => {
    setMembers((prev) => [
      ...prev,
      { id: null, full_name: "", function_role: "", initials: "", percent_dedicated: 100 },
    ]);
  };
  const removeMember = (idx: number) => {
    setMembers((prev) => {
      if (prev.length <= 1) return prev;
      const row = prev[idx];
      if (row.id) setRemovedMemberIds((r) => [...r, row.id!]);
      return prev.filter((_, i) => i !== idx);
    });
  };

  /* Save */
  const handleSave = async () => {
    if (!clientId || saving) return;

    // Validation
    if (!initiativeId) return toast.error("Initiative is required");
    if (!teamName.trim()) return toast.error("Team Name is required");
    for (const [i, m] of members.entries()) {
      if (!m.full_name.trim()) return toast.error(`Member ${i + 1}: Full Name is required`);
      if (!m.initials.trim()) return toast.error(`Member ${i + 1}: Initials are required`);
      if (m.initials.length > 3) return toast.error(`Member ${i + 1}: Initials max 3 chars`);
      if (m.percent_dedicated == null || m.percent_dedicated < 0 || m.percent_dedicated > 100)
        return toast.error(`Member ${i + 1}: Percent Dedicated must be 0–100`);
    }
    if (wip.define < 1 || wip.build < 1 || wip.test < 1)
      return toast.error("WIP limits must be at least 1");

    setSaving(true);
    try {
      let savedTeamId = teamId;

      if (isEdit && teamId) {
        const { error: uErr } = await supabase
          .from("kanban_teams")
          .update({
            team_name: teamName.trim(),
            team_coach: teamCoach.trim() || null,
            product_owner: productOwner.trim() || null,
            comments: comments.trim() || null,
          })
          .eq("id", teamId);
        if (uErr) throw uErr;
      } else {
        const { data: ins, error: iErr } = await supabase
          .from("kanban_teams")
          .insert({
            client_id: clientId,
            initiative_id: initiativeId,
            team_name: teamName.trim(),
            team_coach: teamCoach.trim() || null,
            product_owner: productOwner.trim() || null,
            comments: comments.trim() || null,
          })
          .select("id")
          .single();
        if (iErr) throw iErr;
        savedTeamId = (ins as any).id as string;
      }

      if (!savedTeamId) throw new Error("Save failed: no team id");

      // Members: upsert/update existing, insert new, delete removed
      if (removedMemberIds.length > 0) {
        const { error: dErr } = await supabase
          .from("team_members")
          .delete()
          .in("id", removedMemberIds);
        if (dErr) throw dErr;
      }
      for (const m of members) {
        const payload = {
          full_name: m.full_name.trim(),
          function_role: m.function_role.trim() || null,
          initials: m.initials.trim().toUpperCase(),
          percent_dedicated: m.percent_dedicated,
        };
        if (m.id) {
          const { error } = await supabase.from("team_members").update(payload).eq("id", m.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("team_members").insert({
            ...payload,
            team_id: savedTeamId,
            client_id: clientId,
            profile_id: null,
          });
          if (error) throw error;
        }
      }

      // WIP limits — update (rows seeded by trigger)
      for (const stage of ["define", "build", "test"] as const) {
        const { error } = await supabase
          .from("team_wip_limits")
          .update({ wip_limit: wip[stage] })
          .eq("team_id", savedTeamId)
          .eq("stage", stage);
        if (error) throw error;
      }

      toast.success(isEdit ? "Kanban team updated" : "Kanban team created");
      onBack();
    } catch (e: any) {
      console.error("[TeamForm] save error:", e);
      toast.error(e?.message ?? "Failed to save team");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground p-4">Loading…</p>;
  if (error)
    return (
      <div className="p-4 space-y-2">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={onBack}>Back to list</Button>
      </div>
    );

  const mvpFeatures = features.filter((f) => f.feature_type === "mvp");
  const postFeatures = features.filter((f) => f.feature_type === "post_mvp");

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to teams
        </Button>
        <h2 className="text-lg font-semibold text-primary">
          {isEdit ? "Edit Kanban Team" : "New Kanban Team"}
        </h2>
        <div className="w-[140px]" />
      </div>

      {/* Section 1 */}
      <Card>
        <CardHeader><CardTitle>Team Identity</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Initiative *</Label>
            {isEdit ? (
              <Input
                disabled
                value={
                  lockedInitiative
                    ? `${padLBC(lockedInitiative.display_id)} — ${lockedInitiative.title}`
                    : ""
                }
              />
            ) : (
              <Select
                value={initiativeId}
                onValueChange={setInitiativeId}
                disabled={readOnly}
              >
                <SelectTrigger><SelectValue placeholder="Select an initiative" /></SelectTrigger>
                <SelectContent>
                  {initiativeOpts.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      All initiatives already have teams.
                    </div>
                  ) : (
                    initiativeOpts.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {padLBC(o.display_id)} — {o.title}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>Team Name *</Label>
            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Team Coach / Leader</Label>
            <Input value={teamCoach} onChange={(e) => setTeamCoach(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Product Owner</Label>
            <Input value={productOwner} onChange={(e) => setProductOwner(e.target.value)} disabled={readOnly} />
          </div>
        </CardContent>
      </Card>

      {/* Section 2 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Team Roster</CardTitle>
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={addMember}>
              <Plus className="h-4 w-4 mr-1" /> Add Team Member
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name *</TableHead>
                <TableHead>Function / Role</TableHead>
                <TableHead className="w-24">Initials *</TableHead>
                <TableHead className="w-32">% Dedicated *</TableHead>
                {!readOnly && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m, idx) => (
                <TableRow key={m.id ?? `new-${idx}`}>
                  <TableCell>
                    <Input
                      value={m.full_name}
                      onChange={(e) => updateMember(idx, { full_name: e.target.value })}
                      disabled={readOnly}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={m.function_role}
                      onChange={(e) => updateMember(idx, { function_role: e.target.value })}
                      disabled={readOnly}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      maxLength={3}
                      value={m.initials}
                      onChange={(e) => updateMember(idx, { initials: e.target.value.toUpperCase() })}
                      disabled={readOnly}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={m.percent_dedicated}
                        onChange={(e) =>
                          updateMember(idx, {
                            percent_dedicated: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
                          })
                        }
                        disabled={readOnly}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </TableCell>
                  {!readOnly && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMember(idx)}
                        disabled={members.length <= 1}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 3 — Features */}
      <Card>
        <CardHeader>
          <CardTitle>Features</CardTitle>
          <CardDescription>Read-only — manage features in the Lean Business Case.</CardDescription>
        </CardHeader>
        <CardContent>
          {features.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No features defined yet. Add features in the Lean Business Case.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FeatureReadTable label="MVP Features" rows={mvpFeatures} />
              <FeatureReadTable label="Post-MVP Features" rows={postFeatures} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4 — Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Impact Metrics</CardTitle>
          <CardDescription>Read-only — manage metrics in the Lean Business Case.</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No impact metrics defined yet. Add metrics in the Lean Business Case.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Baseline</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.metric_name}</TableCell>
                    <TableCell>{m.metric_category ?? "—"}</TableCell>
                    <TableCell>
                      {m.metric_type === "outcome_hypothesis"
                        ? "Outcome Hypothesis"
                        : m.metric_type === "leading_indicator"
                        ? "Leading Indicator"
                        : m.metric_type}
                    </TableCell>
                    <TableCell>
                      {m.baseline_value != null
                        ? `${m.baseline_value}${m.baseline_unit ? " " + m.baseline_unit : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {m.target_value != null
                        ? `${m.target_value}${m.target_unit ? " " + m.target_unit : ""}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 5 — WIP */}
      <Card>
        <CardHeader>
          <CardTitle>WIP Limit Settings</CardTitle>
          <CardDescription>Work-in-progress limits per team kanban stage.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 max-w-xl">
          {(["define", "build", "test"] as const).map((stage) => (
            <div key={stage}>
              <Label className="capitalize">{stage} WIP Limit</Label>
              <Input
                type="number"
                min={1}
                value={wip[stage]}
                onChange={(e) =>
                  setWip((prev) => ({ ...prev, [stage]: Math.max(1, parseInt(e.target.value) || 1) }))
                }
                disabled={readOnly}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Section 6 — Comments */}
      <Card>
        <CardHeader><CardTitle>Comments</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            disabled={readOnly}
            rows={4}
          />
        </CardContent>
      </Card>

      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onBack} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[hsl(160,80%,27%)] hover:bg-[hsl(160,80%,22%)] text-white"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Save Team"}
          </Button>
        </div>
      )}
    </div>
  );
}

function FeatureReadTable({ label, rows }: { label: string; rows: FeatureLite[] }) {
  return (
    <div>
      <h4 className="font-semibold text-sm uppercase tracking-wide mb-2 text-primary">{label}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">None.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Feature</TableHead>
              <TableHead>Acceptance Criteria</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium align-top">{r.title || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground align-top whitespace-pre-line">
                  {r.acceptance_criteria || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
