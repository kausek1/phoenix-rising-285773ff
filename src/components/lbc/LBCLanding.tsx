import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Search, Flame, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { Initiative, LeanBusinessCase } from "@/types/database";

interface LBCCard {
  initiative: Initiative;
  lbc: LeanBusinessCase | null;
}

export default function LBCLanding() {
  const { clientId, role } = useAuth();
  const navigate = useNavigate();
  const canCreate = role === "admin" || role === "contributor";

  const [items, setItems] = useState<LBCCard[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ business: false, environmental: false, people: false });

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    const { data: inits } = await supabase
      .from("initiatives").select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    const { data: lbcs } = await supabase
      .from("lean_business_cases").select("*")
      .eq("client_id", clientId);

    const lbcMap = new Map((lbcs || []).map((l: any) => [l.initiative_id, l]));
    setItems((inits || []).map((i: any) => ({
      initiative: i as Initiative,
      lbc: (lbcMap.get(i.id) as LeanBusinessCase) || null,
    })));
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let result = items;
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(({ initiative: i, lbc }) =>
        i.title?.toLowerCase().includes(q) ||
        (lbc as any)?.lbc_number?.toString().includes(q) ||
        i.owner_name?.toLowerCase().includes(q)
      );
    }
    if (filters.business) result = result.filter(({ initiative }) => initiative.impacts_business);
    if (filters.environmental) result = result.filter(({ initiative }) => initiative.impacts_environmental);
    if (filters.people) result = result.filter(({ initiative }) => initiative.impacts_people);
    return result;
  }, [items, search, filters]);

  const recent = useMemo(() => items.slice(0, 5), [items]);
  const showFiltered = search || filters.business || filters.environmental || filters.people;

  const toggleFilter = (key: keyof typeof filters) =>
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));

  const formatLbcNumber = (lbc: LeanBusinessCase | null) => {
    const num = (lbc as any)?.lbc_number;
    return num ? `LBC-${String(num).padStart(3, "0")}` : "—";
  };

  const handleDelete = async (e: React.MouseEvent, initiativeId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this orphan LBC permanently?")) return;
    await supabase.from("lbc_objective_alignments").delete().eq("initiative_id", initiativeId);
    await supabase.from("lean_business_cases").delete().eq("initiative_id", initiativeId);
    const { error } = await supabase.from("initiatives").delete().eq("id", initiativeId);
    if (error) { toast.error("Delete failed: " + error.message); return; }
    toast.success("Deleted");
    fetchData();
  };

  const renderCard = ({ initiative: i, lbc }: LBCCard) => {
    const hasLbcNumber = !!(lbc as any)?.lbc_number;
    return (
    <Card
      key={i.id}
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate({ to: "/lbc/$id", params: { id: i.id } })}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
                style={{ backgroundColor: "#1B4F72" }}
              >
                {formatLbcNumber(lbc)}
              </span>
              <Badge variant="outline" className="text-xs">{i.stage}</Badge>
            </div>
            <h3 className="font-semibold text-sm truncate">{i.title || "Untitled"}</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {i.impacts_business && <Badge className="bg-chart-1 text-destructive-foreground text-xs">Business</Badge>}
              {i.impacts_environmental && <Badge className="bg-accent text-accent-foreground text-xs">Environmental</Badge>}
              {i.impacts_people && <Badge className="bg-chart-4 text-foreground text-xs">People</Badge>}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground shrink-0 flex flex-col items-end gap-1">
            {!hasLbcNumber && (
              <button
                onClick={(e) => handleDelete(e, i.id)}
                className="p-1 rounded hover:bg-destructive/10 text-destructive"
                title="Delete orphan LBC"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <div>{(lbc as any)?.initiative_owner_name || i.owner_name || "—"}</div>
            <div className="mt-1">{i.funnel_entry_date || "—"}</div>
          </div>
        </div>
      </CardContent>
    </Card>
    );
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg gradient-phoenix flex items-center justify-center shrink-0">
          <Flame className="h-5 w-5 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-primary">Lean Business Case</h1>
      </div>

      {/* Create button */}
      {canCreate && (
        <Link to="/lbc/new">
          <button className="lbc-create-btn flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90">
            <FileText className="h-5 w-5" />
            Create New LBC
          </button>
        </Link>
      )}

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by LBC number, name, or impacted area..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(["business", "environmental", "people"] as const).map(key => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filters[key]
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-muted text-muted-foreground border-border hover:bg-secondary"
              }`}
            >
              {key === "people" ? "People/Social" : key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Search results or Recent */}
      {showFiltered ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Search Results ({filtered.length})
          </h2>
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No matching LBCs found.</p>
          )}
          {filtered.map(renderCard)}
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Recent LBCs</h2>
          {recent.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No LBCs yet. Create your first one!</p>
          )}
          {recent.map(renderCard)}
        </section>
      )}
    </div>
  );
}
