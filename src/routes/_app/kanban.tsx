import { createFileRoute } from "@tanstack/react-router";
import { KanbanSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/kanban")({
  component: KanbanPage,
});

function KanbanPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">Kanban Board</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KanbanSquare className="h-5 w-5 text-accent" />
            Execution Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Visualize and manage work items across workflow stages — from backlog to done.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
