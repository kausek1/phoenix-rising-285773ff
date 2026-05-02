import { createFileRoute } from "@tanstack/react-router";
import TeamKanbanBoard from "@/components/team-kanban/TeamKanbanBoard";

export const Route = createFileRoute("/_app/team-kanban/$teamId")({
  component: TeamKanbanBoardPage,
});

function TeamKanbanBoardPage() {
  const { teamId } = Route.useParams();
  return <TeamKanbanBoard teamId={teamId} />;
}
