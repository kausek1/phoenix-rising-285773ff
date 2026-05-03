import { createFileRoute } from "@tanstack/react-router";
import TeamDashboard from "@/components/team-dashboard/TeamDashboard";

export const Route = createFileRoute("/_app/team-dashboard/$teamId")({
  component: TeamDashboardPage,
});

function TeamDashboardPage() {
  const { teamId } = Route.useParams();
  return <TeamDashboard teamId={teamId} />;
}
