import { createFileRoute } from "@tanstack/react-router";
import KanbanArchivedIdeasView from "@/components/kanban/KanbanArchivedIdeasView";

export const Route = createFileRoute("/_app/kanban/archived")({
  component: KanbanArchivedIdeasView,
});
