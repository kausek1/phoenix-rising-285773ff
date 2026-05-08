import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ExecDashboardSettings,
  ExecDashboardTile,
} from "@/types/executiveDashboard";

interface Props {
  selectedNav: string | null;
  selectedTile: string | null;
  clientId: string;
  settings: ExecDashboardSettings | null;
  tile?: ExecDashboardTile | null;
  navLabel?: string | null;
  onClose: () => void;
}

export default function DrillDownPanel({
  selectedNav,
  selectedTile,
  tile,
  navLabel,
  onClose,
}: Props) {
  const title = selectedNav
    ? `Stage: ${navLabel ?? selectedNav}`
    : selectedTile && tile
      ? tile.tile_label
      : "Detail";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-foreground">{title}</div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Drill-down detail will appear here.
      </div>
    </div>
  );
}
