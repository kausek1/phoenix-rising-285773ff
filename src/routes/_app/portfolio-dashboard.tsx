import { createFileRoute } from "@tanstack/react-router";
import PortfolioDashboard from "@/components/portfolio-dashboard/PortfolioDashboard";

export const Route = createFileRoute("/_app/portfolio-dashboard")({
  component: PortfolioDashboard,
});
