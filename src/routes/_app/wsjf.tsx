import { createFileRoute } from "@tanstack/react-router";
import { Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/wsjf")({
  component: WSJFPage,
});

function WSJFPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">WSJF Scoring</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-accent" />
            Weighted Shortest Job First
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Prioritize improvement items using WSJF methodology — balancing business value, time criticality, and risk reduction against job size.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
