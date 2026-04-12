import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/kanban/")({
  component: () => <Navigate to="/kanban/active" />,
});
