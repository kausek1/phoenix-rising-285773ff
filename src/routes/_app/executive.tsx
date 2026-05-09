import { createFileRoute } from "@tanstack/react-router";
import ExecutiveDashboard from "@/components/executive/ExecutiveDashboard";

export const Route = createFileRoute("/_app/executive")({
  component: ExecutiveDashboard,
});
