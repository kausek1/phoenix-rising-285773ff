import { createFileRoute } from "@tanstack/react-router";
import KanbanDeployedView from "@/components/kanban/KanbanDeployedView";

export const Route = createFileRoute("/_app/kanban/deployed")({
  component: KanbanDeployedView,
});
