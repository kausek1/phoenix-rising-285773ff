import { createFileRoute } from "@tanstack/react-router";
import LBCFormPage from "@/components/lbc/LBCFormPage";

export const Route = createFileRoute("/_app/lbc/$id")({
  component: LBCEditPage,
});

function LBCEditPage() {
  const { id } = Route.useParams();
  return <LBCFormPage editId={id} />;
}
