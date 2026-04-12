import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/kanban")({
  component: KanbanLayout,
});

function KanbanLayout() {
  return <Outlet />;
}
