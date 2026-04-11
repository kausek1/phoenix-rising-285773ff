import { createFileRoute } from "@tanstack/react-router";
import WSJFModule from "@/components/wsjf/WSJFModule";

export const Route = createFileRoute("/_app/wsjf")({
  component: WSJFModule,
});
