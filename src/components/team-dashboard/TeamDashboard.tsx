import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SprintHealthPanel } from "@/components/team-kanban/SprintHealthPanel";

type Stage = "feature" | "backlog" | "define" | "build" | "test" | "deploy" | "done";

const STAGE_ORDER: Record<Stage, number> = {
  feature: 0,
  backlog: 1,
  define: 2,
  build: 3,
  test: 4,
  deploy: 5,
  done: 6,
};

const FLOW_STAGES: { key: Stage; color: string; label: string }[] = [
  { key: "done", color: "#0E7A65", label: "Done" },
  { key: "deploy", color: "#0284c7", label: "Deploy" },
  { key: "test", color: "#7c3aed", label: "Test" },
  { key: "build", color: "#d97706", label: "Build" },
  { key: "define", color: "#64748b", label: "Define" },
  { key: "backlog", color: "#e2e8f0", label: "Backlog" },
];

interface ActivePI { id: string; name: string; }
interface ActiveSprint {
  id: string; name: string; sprint_number: number | null;
  start_date: string; end_date: string;
}
interface TeamRecord {
  id: string;
  team_name: string;
  team_coach: string | null;
  product_owner: string | null;
  initiative: { title: string; display_id: number | null } | null;
}
interface SprintStory {
  id: string;
  stage: Stage;
  stage_entered_at: string | null;
  committed_to_sprint_at: string | null;
}
interface SnapshotRow {
  snapshot_date: string;
  stage: Stage;
  story_count: number;
}

const CFD_STAGES: { key: Exclude<Stage, "feature">; color: string; stroke: string; label: string }[] = [
  { key: "backlog", color: "#e2e8f0", stroke: "#cbd5e1", label: "Backlog" },
  { key: "define", color: "#64748b", stroke: "#64748b", label: "Define" },
  { key: "build", color: "#d97706", stroke: "#d97706", label: "Build" },
  { key: "test", color: "#7c3aed", stroke: "#7c3aed", label: "Test" },
  { key: "deploy", color: "#0284c7", stroke: "#0284c7", label: "Deploy" },
  { key: "done", color: "#0E7A65", stroke: "#0E7A65", label: "Done" },
];

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("T")[0].split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatSprintRange(s: ActiveSprint): string {
  const start = parseDateOnly(s.start_date);
  const end = parseDateOnly(s.end_date);
  const sameMonth =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  const startStr = format(start, "MMM d");
  const endStr = sameMonth
    ? format(end, "d, yyyy")
    : sameYear
      ? format(end, "MMM d, yyyy")
      : format(end, "MMM d, yyyy");
  return `Sprint ${s.sprint_number ?? ""} — ${startStr}–${endStr}`.replace(
    "Sprint  —",
    "Sprint —",
  );
}

function lbcLabel(displayId: number | null | undefined): string {
  if (displayId == null) return "LBC-—";
  return "LBC-" + String(displayId).padStart(3, "0");
}

function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (cur.getTime() <= e.getTime()) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

export default function TeamDashboard({ teamId }: { teamId: string }) {
  const { clientId } = useAuth();
  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [activePI, setActivePI] = useState<ActivePI | null>(null);
  const [activeSprint, setActiveSprint] = useState<ActiveSprint | null>(null);
  const [stories, setStories] = useState<SprintStory[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId || !teamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: tData } = await supabase
        .from("kanban_teams")
        .select(
          "id, team_name, team_coach, product_owner, initiatives(title, display_id)",
        )
        .eq("id", teamId)
        .eq("client_id", clientId)
        .single();
      if (cancelled) return;
      if (tData) {
        const t: any = tData;
        setTeam({
          id: t.id,
          team_name: t.team_name,
          team_coach: t.team_coach,
          product_owner: t.product_owner,
          initiative: t.initiatives
            ? { title: t.initiatives.title, display_id: t.initiatives.display_id }
            : null,
        });
      }

      const { data: piRows } = await supabase
        .from("planning_increments")
        .select("id, name")
        .eq("client_id", clientId)
        .eq("status", "active")
        .limit(1);
      const pi = (piRows ?? [])[0] as ActivePI | undefined;
      if (cancelled) return;
      setActivePI(pi ?? null);
      if (!pi) { setActiveSprint(null); setStories([]); setSnapshots([]); setLoading(false); return; }

      const { data: spRows } = await supabase
        .from("sprints")
        .select("id, name, sprint_number, start_date, end_date")
        .eq("client_id", clientId)
        .eq("planning_increment_id", pi.id)
        .eq("status", "active")
        .limit(1);
      if (cancelled) return;
      const sp = (spRows ?? [])[0] as ActiveSprint | undefined;
      setActiveSprint(sp ?? null);
      if (!sp) { setStories([]); setSnapshots([]); setLoading(false); return; }

      const { data: stRows } = await supabase
        .from("kanban_stories")
        .select("id, stage, stage_entered_at, committed_to_sprint_at")
        .eq("client_id", clientId)
        .eq("sprint_id", sp.id);
      if (cancelled) return;
      setStories((stRows as SprintStory[]) ?? []);

      const { data: snapRows } = await supabase
        .from("story_stage_snapshots")
        .select("snapshot_date, stage, story_count")
        .eq("client_id", clientId)
        .eq("sprint_id", sp.id)
        .order("snapshot_date", { ascending: true });
      if (cancelled) return;
      setSnapshots((snapRows as SnapshotRow[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, teamId]);

  const sprintDays = useMemo(() => {
    if (!activeSprint) return [];
    return eachDay(parseDateOnly(activeSprint.start_date), parseDateOnly(activeSprint.end_date));
  }, [activeSprint]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const totalPlanned = stories.length;

  const burnDownData = useMemo(() => {
    if (!sprintDays.length) return [];
    const totalDays = sprintDays.length;
    return sprintDays.map((day, idx) => {
      const ideal =
        totalDays > 1
          ? totalPlanned * (1 - idx / (totalDays - 1))
          : 0;
      const isPastOrToday = day.getTime() <= today.getTime();
      const endOfDay = new Date(day); endOfDay.setHours(23, 59, 59, 999);
      let actual: number | null = null;
      if (isPastOrToday) {
        const completedByDay = stories.filter((s) => {
          if (s.stage !== "done") return false;
          if (!s.stage_entered_at) return false;
          return new Date(s.stage_entered_at).getTime() <= endOfDay.getTime();
        }).length;
        actual = totalPlanned - completedByDay;
      }
      return {
        day: format(day, "MMM d"),
        dayNumber: idx + 1,
        ideal: Math.round(ideal * 100) / 100,
        actual,
      };
    });
  }, [sprintDays, stories, totalPlanned, today]);

  const cumulativeFlowData = useMemo(() => {
    if (!sprintDays.length) return [];
    return sprintDays.map((day, idx) => {
      const endOfDay = new Date(day); endOfDay.setHours(23, 59, 59, 999);
      const isPastOrToday = day.getTime() <= today.getTime();
      const row: any = { day: format(day, "MMM d"), dayNumber: idx + 1 };
      FLOW_STAGES.forEach((s) => { row[s.key] = 0; });
      if (!isPastOrToday) return row;
      stories.forEach((story) => {
        const enteredRaw = story.stage_entered_at ?? story.committed_to_sprint_at;
        const enteredAt = enteredRaw ? new Date(enteredRaw) : null;
        // Story occupies exactly its current stage band on this day,
        // provided it has entered that stage by end-of-day. Stories that
        // haven't entered their current stage yet are treated as still in
        // backlog so the total per day always equals totalPlanned.
        const inCurrentStage =
          enteredAt && enteredAt.getTime() <= endOfDay.getTime();
        const stageKey: Stage = inCurrentStage ? story.stage : "backlog";
        if (row[stageKey] !== undefined) {
          row[stageKey] += 1;
        }
      });
      return row;
    });
  }, [sprintDays, stories, today]);

  const xTickFormatter = (_: string, idx: number) =>
    idx % 5 === 0 ? sprintDays[idx] ? format(sprintDays[idx], "MMM d") : "" : "";

  if (loading) {
    return <p className="text-muted-foreground p-6">Loading dashboard…</p>;
  }

  if (!team) {
    return <p className="text-destructive p-6">Team not found.</p>;
  }

  const lbc = lbcLabel(team.initiative?.display_id);
  const hasStories = stories.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 border-b pb-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-primary">
            {team.team_name} <span className="text-muted-foreground">— {lbc}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {team.initiative?.title ?? "No initiative"}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Team Coach:</span>{" "}
            <span className="font-medium">{team.team_coach ?? "—"}</span>
            <span className="mx-3 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Product Owner:</span>{" "}
            <span className="font-medium">{team.product_owner ?? "—"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activePI && activeSprint && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium"
              style={{ background: "#E0F2FE", color: "#0F2A4A" }}
            >
              {activePI.name} · {formatSprintRange(activeSprint)}
            </span>
          )}
        </div>
      </div>

      {!activeSprint ? (
        <div className="py-16 text-center text-muted-foreground">
          No active sprint found.
        </div>
      ) : (
        <>
          <SprintHealthPanel clientId={clientId ?? ""} sprint={activeSprint} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Burn-Down */}
            <div style={cardStyle}>
              <div style={{ fontSize: 16, color: "#1B4F72", fontWeight: 700 }}>
                Sprint Burn-Down
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                Stories remaining vs ideal burn
              </div>
              {!hasStories ? (
                <div
                  className="flex items-center justify-center text-center"
                  style={{ height: 320, color: "#64748b", fontSize: 13 }}
                >
                  No stories committed to this sprint yet.<br />
                  Use Sprint Planning to commit stories.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={burnDownData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickFormatter={xTickFormatter as any}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, totalPlanned]}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      label={{
                        value: "Stories Remaining",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 11, fill: "#64748b" },
                      }}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      labelFormatter={(label, payload) => {
                        const d = payload?.[0]?.payload?.dayNumber;
                        return `Day ${d} — ${label}`;
                      }}
                      formatter={((value: any, name: any) => {
                        const n = name === "actual" ? "Remaining" : "Ideal";
                        if (value == null) return ["—", n];
                        return [`${value} stories`, n];
                      }) as any}
                    />
                    <ReferenceLine
                      y={0}
                      stroke="#0E7A65"
                      strokeDasharray="4 4"
                      label={{ value: "Done", fontSize: 10, fill: "#0E7A65", position: "right" }}
                    />
                    <Line
                      type="linear"
                      dataKey="ideal"
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      name="ideal"
                    />
                    <Line
                      type="linear"
                      dataKey="actual"
                      stroke="#1B4F72"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#1B4F72" }}
                      connectNulls={false}
                      isAnimationActive={false}
                      name="actual"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Cumulative Flow */}
            <div style={cardStyle}>
              <div style={{ fontSize: 16, color: "#1B4F72", fontWeight: 700 }}>
                Cumulative Flow
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                Stories by stage over time
              </div>
              {!hasStories ? (
                <div
                  className="flex items-center justify-center text-center"
                  style={{ height: 320, color: "#64748b", fontSize: 13 }}
                >
                  No stories committed to this sprint yet.<br />
                  Use Sprint Planning to commit stories.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={cumulativeFlowData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickFormatter={xTickFormatter as any}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, totalPlanned]}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      label={{
                        value: "Stories",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 11, fill: "#64748b" },
                      }}
                    />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      iconType="square"
                      align="center"
                      verticalAlign="bottom"
                    />
                    {FLOW_STAGES.map((s) => (
                      <Area
                        key={s.key}
                        type="stepAfter"
                        dataKey={s.key}
                        stackId="1"
                        stroke={s.color}
                        fill={s.color}
                        name={s.label}
                        isAnimationActive={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
