import { supabase } from "@/integrations/supabase/client";

/**
 * The authoritative initiative owner lives on lean_business_cases.initiative_owner_name
 * (joined on initiative_id). initiatives.owner_name is a legacy fallback.
 */
export async function fetchInitiativeOwners(
  initiativeIds: string[],
): Promise<Record<string, string>> {
  if (initiativeIds.length === 0) return {};
  const { data } = await supabase
    .from("lean_business_cases")
    .select("initiative_id, initiative_owner_name")
    .in("initiative_id", initiativeIds);
  const map: Record<string, string> = {};
  for (const r of (data as any[]) ?? []) {
    if (r.initiative_owner_name) map[r.initiative_id] = r.initiative_owner_name;
  }
  return map;
}
