import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/portfolio")({
  component: PortfolioPage,
});

function PortfolioPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">Portfolio</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            Portfolio Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Track strategic portfolio health with progress metrics, status summaries, and cross-initiative insights.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
