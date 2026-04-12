import { createFileRoute } from "@tanstack/react-router";
import AssetInventoryLanding from "@/components/assets/AssetInventoryLanding";

export const Route = createFileRoute("/_app/assets/")({
  component: AssetInventoryLanding,
});
