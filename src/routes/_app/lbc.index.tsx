import { createFileRoute } from "@tanstack/react-router";
import LBCLanding from "@/components/lbc/LBCLanding";

export const Route = createFileRoute("/_app/lbc/")({
  component: LBCLanding,
});
