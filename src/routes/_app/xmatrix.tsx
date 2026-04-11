import { createFileRoute } from "@tanstack/react-router";
import XMatrixModule from "@/components/xmatrix/XMatrixModule";

export const Route = createFileRoute("/_app/xmatrix")({
  component: XMatrixModule,
});
