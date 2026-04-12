import { createFileRoute } from "@tanstack/react-router";
import KanbanArchiveView from "@/components/kanban/KanbanArchiveView";

export const Route = createFileRoute("/_app/kanban/archive")({
  component: KanbanArchiveView,
});
