import { createFileRoute } from "@tanstack/react-router";
import KanbanActiveBoard from "@/components/kanban/KanbanActiveBoard";

export const Route = createFileRoute("/_app/kanban/active")({
  component: KanbanActiveBoard,
});
