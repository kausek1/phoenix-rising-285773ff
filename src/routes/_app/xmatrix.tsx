import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/xmatrix")({
  component: XMatrixPage,
});

function XMatrixPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">X-Matrix</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-accent" />
            Strategy Deployment Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Manage long-term goals, annual objectives, improvement priorities, KPIs, and their correlations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
