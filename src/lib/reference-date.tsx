import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Reference date for "today" in evaluative calculations (RAG freshness,
 * sprint/PI progress, days remaining/overdue, dashboard tile statuses).
 *
 * Loaded from executive_dashboard_settings.reporting_reference_date for the
 * active tenant. Falls back to system time when the column is NULL so live
 * client tenants are unaffected.
 *
 * Do NOT use this for data writes (created_at, updated_at, transition
 * timestamps) — those must continue to use real system time.
 */

const RefDateCtx = createContext<Date>(new Date());

export function useReferenceDate(): Date {
  return useContext(RefDateCtx);
}

/** Parse a YYYY-MM-DD date as a local-midnight Date. */
function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("T")[0].split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export async function loadReferenceDate(clientId: string | null | undefined): Promise<Date> {
  if (!clientId) return new Date();
  try {
    const { data } = await supabase
      .from("executive_dashboard_settings")
      .select("reporting_reference_date")
      .eq("client_id", clientId)
      .maybeSingle();
    const raw = (data as { reporting_reference_date?: string | null } | null)?.reporting_reference_date;
    if (raw) return parseDateOnly(raw);
  } catch {
    /* fall through to system date */
  }
  return new Date();
}

export function ReferenceDateProvider({ children }: { children: ReactNode }) {
  const { clientId } = useAuth();
  const [date, setDate] = useState<Date>(() => new Date());

  useEffect(() => {
    let cancelled = false;
    void loadReferenceDate(clientId).then((d) => {
      if (!cancelled) setDate(d);
    });
    return () => { cancelled = true; };
  }, [clientId]);

  return <RefDateCtx.Provider value={date}>{children}</RefDateCtx.Provider>;
}
