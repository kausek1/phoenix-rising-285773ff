import { createFileRoute } from "@tanstack/react-router";
import PortfolioModule from "@/components/portfolio/PortfolioModule";

export const Route = createFileRoute("/_app/portfolio")({
  component: PortfolioModule,
});
