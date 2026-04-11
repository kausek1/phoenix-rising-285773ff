import { createFileRoute } from "@tanstack/react-router";
import LBCModule from "@/components/lbc/LBCModule";

export const Route = createFileRoute("/_app/lbc")({
  component: LBCModule,
});
