import { useAuth } from "@/lib/auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ClientSwitcher() {
  const { accessibleClients, clientId, client, setActiveClient } = useAuth();

  if (accessibleClients.length <= 1) {
    return (
      <span className="font-semibold text-primary text-sm">
        {client?.name ?? "PhoenixV2"}
      </span>
    );
  }

  return (
    <Select value={clientId ?? undefined} onValueChange={setActiveClient}>
      <SelectTrigger className="h-8 text-sm font-semibold text-primary border-border bg-card min-w-[180px]">
        <SelectValue placeholder="Select client" />
      </SelectTrigger>
      <SelectContent>
        {accessibleClients.map((c) => (
          <SelectItem key={c.client_id} value={c.client_id} className="text-sm">
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
