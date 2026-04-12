import { createFileRoute } from "@tanstack/react-router";
import LBCFormPage from "@/components/lbc/LBCFormPage";

export const Route = createFileRoute("/_app/lbc/new")({
  component: () => <LBCFormPage />,
});
