import { createFileRoute } from "@tanstack/react-router";
import AssetDetailPage from "@/components/assets/AssetDetailPage";

export const Route = createFileRoute("/_app/assets/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <AssetDetailPage assetId={id} />;
  },
});
