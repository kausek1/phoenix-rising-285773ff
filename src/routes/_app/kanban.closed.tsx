import { createFileRoute } from "@tanstack/react-router";
import KanbanClosedView from "@/components/kanban/KanbanClosedView";

export const Route = createFileRoute("/_app/kanban/closed")({
  component: KanbanClosedView,
});
