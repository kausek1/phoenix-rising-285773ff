import { useEffect, useState } from "react";
import { ClipboardList, CheckCircle, TrendingUp, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SprintLite {
  id: string;
  name: string;
  sprint_number: number | null;
  end_date: string;
}

interface Props {
  clientId: string;
  teamId: string;
  sprint: SprintLite | null;
  refreshKey?: number;
}

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("T")[0].split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function daysRemaining(endDate: string): number {
  const end = parseDateOnly(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end.getTime() - today.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

export function SprintHealthPanel({ clientId, teamId, sprint, refreshKey }: Props) {
  const [planned, setPlanned] = useState(0);
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    if (!clientId || !teamId || !sprint) { setPlanned(0); setCompleted(0); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("kanban_stories")
        .select("id, stage, team_id")
        .eq("client_id", clientId)
        .eq("team_id", teamId)
        .not("team_id", "is", null)
        .eq("sprint_id", sprint.id);
      if (cancelled) return;
      if (error) { setPlanned(0); setCompleted(0); return; }
      const rows = ((data ?? []) as { stage: string; team_id: string | null }[])
        .filter((r) => r.team_id === teamId);
      setPlanned(rows.length);
      setCompleted(rows.filter((r) => r.stage === "done").length);
    })();
    return () => { cancelled = true; };
  }, [clientId, teamId, sprint, refreshKey]);

  const wrapperCls =
    "bg-white border rounded-lg mb-4";
  const wrapperStyle = { borderColor: "#E2E8F0", padding: "12px 20px" } as const;

  if (!sprint) {
    return (
      <div className={wrapperCls} style={wrapperStyle}>
        <p
          className="text-center italic"
          style={{ fontSize: 13, color: "#64748b" }}
        >
          No active sprint. Use Sprint Planning to commit stories to the current sprint.
        </p>
      </div>
    );
  }

  const sprintLabel = `Sprint ${sprint.sprint_number ?? ""}`.trim();
  const velocityNum = planned > 0 ? Math.round((completed / planned) * 100) : null;
  const velocityDisplay = velocityNum == null ? "—" : `${velocityNum}%`;
  const velocityColor =
    velocityNum == null
      ? "#94a3b8"
      : velocityNum >= 80
        ? "#0E7A65"
        : velocityNum >= 50
          ? "#D97706"
          : "#DC2626";

  const days = daysRemaining(sprint.end_date);
  const daysColor =
    days > 7 ? "#1B4F72" : days >= 4 ? "#D97706" : "#DC2626";

  const labelStyle = {
    fontSize: 11,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    fontWeight: 600,
  };
  const subStyle = { fontSize: 11, color: "#94a3b8" };
  const valueBase = { fontSize: 28, fontWeight: 700, lineHeight: 1.1 };

  const Tile = ({
    label, value, valueColor, subtext, Icon, iconColor, children,
  }: {
    label: string;
    value: string | number;
    valueColor: string;
    subtext: string;
    Icon: typeof ClipboardList;
    iconColor: string;
    children?: React.ReactNode;
  }) => (
    <div className="flex-1 min-w-0 px-4 first:pl-0 last:pr-0">
      <div className="flex items-start justify-between gap-2">
        <div style={labelStyle}>{label}</div>
        <Icon size={16} color={iconColor} />
      </div>
      <div style={{ ...valueBase, color: valueColor, marginTop: 4 }}>{value}</div>
      {children}
      <div style={{ ...subStyle, marginTop: 4 }}>{subtext}</div>
    </div>
  );

  return (
    <div className={wrapperCls} style={wrapperStyle}>
      <div className="grid grid-cols-2 gap-y-3 sm:flex sm:flex-row sm:[&>*+*]:border-l sm:[&>*+*]:border-[#E2E8F0]">
        <Tile
          label="Stories Planned"
          value={planned}
          valueColor="#1B4F72"
          subtext={`committed to ${sprintLabel}`}
          Icon={ClipboardList}
          iconColor="#1B4F72"
        />
        <Tile
          label="Stories Completed"
          value={completed}
          valueColor="#0E7A65"
          subtext="moved to Done this sprint"
          Icon={CheckCircle}
          iconColor="#0E7A65"
        />
        <Tile
          label="Sprint Velocity"
          value={velocityDisplay}
          valueColor={velocityColor}
          subtext="target ≥ 80%"
          Icon={TrendingUp}
          iconColor={velocityColor}
        >
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: "#F1F5F9",
              marginTop: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(velocityNum ?? 0, 100)}%`,
                background: velocityColor,
                borderRadius: 2,
                transition: "width 200ms",
              }}
            />
          </div>
        </Tile>
        <Tile
          label="Days Remaining"
          value={days}
          valueColor={daysColor}
          subtext={`in ${sprintLabel}`}
          Icon={Calendar}
          iconColor={daysColor}
        />
      </div>
    </div>
  );
}
