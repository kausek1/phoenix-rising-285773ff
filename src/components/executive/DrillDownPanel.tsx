import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { format, differenceInDays } from "date-fns";
import {
  X,
  Building2,
  GitBranch,
  AlertTriangle,
  PlayCircle,
  Network,
  Calendar,
  DollarSign,
  ClipboardCheck,
  AlertCircle,
  Clock,
  Cloud,
  Zap,
  Droplets,
  Leaf,
  FileText,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchInitiativeOwners } from "@/lib/initiative-owners";
import { fetchInitiativeEstimates, type InitiativeEstimate } from "@/lib/initiative-estimates";
import { useReferenceDate } from "@/lib/reference-date";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCurrency,
  type ExecDashboardSettings,
  type ExecDashboardTile,
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

const STAGE_LABEL: Record<string, string> = {
  funnel: "Funnel",
  review: "Review",
  analysis: "Analysis",
  ready: "Ready",
  in_delivery: "In Delivery",
  deployed: "Deployed",
  closed: "Closed",
  archive: "Archived",
};

const AVATAR_COLORS = [
  "bg-blue-50 text-blue-700",
  "bg-emerald-50 text-emerald-700",
  "bg-purple-50 text-purple-700",
  "bg-amber-50 text-amber-700",
];

function EmptyStateMessage({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`text-[10px] text-muted-foreground text-center py-6 px-2 italic ${className}`}
    >
      {message}
    </div>
  );
}

function ErrorMessage() {
  return (
    <div className="text-[10px] text-red-500">
      Unable to load data — please refresh
    </div>
  );
}

function ColumnSkeletons() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function initialsFor(fullName?: string | null) {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

function firstNameOf(fullName?: string | null) {
  if (!fullName) return "Unassigned";
  return fullName.trim().split(/\s+/)[0] ?? "Unassigned";
}

function statusBadge(status: string | null | undefined) {
  if (status === "on_track")
    return { cls: "bg-emerald-50 text-emerald-700", label: "● On track" };
  if (status === "at_risk")
    return { cls: "bg-amber-50 text-amber-700", label: "● At risk" };
  if (status === "off_track")
    return { cls: "bg-red-50 text-red-700", label: "● Off track" };
  return { cls: "bg-muted text-muted-foreground", label: "● No reading" };
}

function stageBadgeCls(stage: string) {
  switch (stage) {
    case "ready":
      return "bg-blue-50 text-blue-700";
    case "in_delivery":
      return "bg-emerald-50 text-emerald-700";
    case "commissioned":
    case "verified":
      return "bg-muted text-muted-foreground";
    case "review":
      return "bg-blue-50 text-blue-700";
    case "analysis":
      return "bg-red-50 text-red-700";
    case "scoping":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function DrillDownPanel({
  selectedNav,
  selectedTile,
  clientId,
  settings,
  tile,
  navLabel,
  onClose,
}: Props) {
  // Determine which content to render
  const showP = selectedNav === "P";
  const showCarbon = selectedTile === "carbon";
  const showEnergy = selectedTile === "energy";
  const showO = selectedNav === "O";
  const showH = selectedNav === "H";
  const showX = selectedNav === "X";
  const showE =
    selectedNav === "E" ||
    selectedTile === "cost" ||
    selectedTile === "spend";
  const showN = selectedNav === "N";
  const showI = selectedNav === "I" || selectedTile === "outcomes";

  let Icon: LucideIcon = Building2;
  let title = "";
  let subtitle = "";

  if (showP) {
    Icon = Building2;
    title = "Portfolio baseline";
    subtitle =
      "Active and deployed initiatives — Ready · In Delivery · Deployed";
  } else if (showCarbon) {
    Icon = Cloud;
    title = "Carbon reductions verified";
    subtitle = "Emissions by asset · Scope 1 + 2 · 2024";
  } else if (showEnergy) {
    Icon = Zap;
    title = "Energy reduction achieved";
    subtitle = "Energy consumption by asset · 2024";
  } else if (showO) {
    Icon = GitBranch;
    title = "Options pipeline";
    subtitle = "Initiatives under evaluation — Review · Analysis · Funnel";
  } else if (showH) {
    Icon = AlertTriangle;
    title = "Hotspots & constraints";
    subtitle = "Top emissions sources and delivery blockers";
  } else if (showX) {
    Icon = PlayCircle;
    title = "Execution";
    subtitle = "90-day sprint — active delivery and early wins";
  } else if (showE) {
    Icon = DollarSign;
    title = "Economics & funding";
    subtitle =
      "Budget utilisation, savings delivered, and ROI by initiative";
  } else if (showN) {
    Icon = Network;
    title = "Networked delivery";
    subtitle =
      "Strategy → KPI → initiative ownership and traceability";
  } else if (showI) {
    Icon = ClipboardCheck;
    title = "Implementation system";
    subtitle =
      "Outcome hypothesis tracker — target vs actual with delivery context";
  } else {
    title = selectedNav
      ? `Stage: ${navLabel ?? selectedNav}`
      : selectedTile && tile
        ? tile.tile_label
        : "Detail";
  }

  let tileFilterBadge: { cls: string; label: string } | null = null;
  if (showE && selectedTile === "cost")
    tileFilterBadge = {
      cls: "bg-emerald-50 text-emerald-700",
      label: "Cost savings view",
    };
  else if (showE && selectedTile === "spend")
    tileFilterBadge = {
      cls: "bg-emerald-50 text-emerald-700",
      label: "Budget utilisation view",
    };
  else if (showI && selectedTile === "outcomes")
    tileFilterBadge = {
      cls: "bg-emerald-50 text-emerald-700",
      label: "Outcomes on track view",
    };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border mb-3 pb-2">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className="text-[#1B4F72]" />
          <span className="text-sm font-medium text-foreground">{title}</span>
          {subtitle && (
            <span className="text-[12px] text-muted-foreground ml-1.5">
              {subtitle}
            </span>
          )}
          {tileFilterBadge && (
            <span
              className={`text-[9px] px-2 rounded ml-1 ${tileFilterBadge.cls}`}
            >
              {tileFilterBadge.label}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6"
        >
          <X size={14} />
        </Button>
      </div>

      {showP && <PContent clientId={clientId} settings={settings} />}
      {showCarbon && <CarbonAssetPanel clientId={clientId} />}
      {showEnergy && <EnergyAssetPanel clientId={clientId} />}
      {showO && <OContent clientId={clientId} />}
      {showH && <HContent clientId={clientId} />}
      {showX && <XContent clientId={clientId} />}
      {showE && <EContent clientId={clientId} settings={settings} />}
      {showN && <NContent clientId={clientId} settings={settings} />}
      {showI && <IContent clientId={clientId} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// P CONTENT — Portfolio baseline
// ─────────────────────────────────────────────────────────

interface PInitiative {
  id: string;
  display_id: number | null;
  title: string;
  stage: string;
  wsjf_score: number | null;
  due_date: string | null;
  owner_id: string | null;
  owner_name: string | null;
  ownerName: string | null;
  status: string | null;
  daysInStage: number | null;
  estimate?: InitiativeEstimate | null;
}

function PContent({
  clientId,
  settings,
}: {
  clientId: string;
  settings: ExecDashboardSettings | null;
}) {
  const referenceDate = useReferenceDate();
  const [pdfUrl, setPdfUrl] = useState<string | null>(
    settings?.xmatrix_pdf_url ?? null,
  );
  const [pdfFilename, setPdfFilename] = useState<string | null>(
    settings?.xmatrix_pdf_filename ?? null,
  );
  const [pdfUploadedAt, setPdfUploadedAt] = useState<string | null>(
    settings?.xmatrix_pdf_uploaded_at ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [initiatives, setInitiatives] = useState<PInitiative[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, { full_name: string }>>({});
  const [lbcOwnerMap, setLbcOwnerMap] = useState<Record<string, string>>({});
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [daysInStage, setDaysInStage] = useState<Record<string, number>>({});
  const [estimates, setEstimates] = useState<Record<string, InitiativeEstimate>>({});

  useEffect(() => {
    let isMounted = true;

    const fetchPData = async () => {
      setLoading(true);
      setError(false);
      try {
        // Step 1: fetch initiatives
        const { data: inits, error: initsError } = await supabase
          .from("initiatives")
          .select("id, title, stage, wsjf_score, due_date, owner_id, owner_name, display_id")
          .eq("client_id", clientId)
          .in("stage", ["ready", "in_delivery", "deployed"])
          .order("title", { ascending: true });
        if (initsError) throw initsError;
        const initiatives = (inits ?? []) as PInitiative[];
        console.log("P panel initiatives:", initiatives.length, initiatives);

        // Step 2: fetch owner profiles
        const ownerIds = [
          ...new Set(initiatives.map((i) => i.owner_id).filter(Boolean)),
        ] as string[];

        const profileMap: Record<string, { full_name: string }> = {};
        if (ownerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ownerIds);

          for (const p of profiles ?? []) {
            profileMap[p.id] = p;
          }
        }

        // Step 3: fetch latest OH metric reading per initiative
        const initIds = initiatives.map((i) => i.id);
        const statusMap: Record<string, string> = {};
        if (initIds.length > 0) {
          const { data: metrics } = await supabase
            .from("initiative_metrics")
            .select("id, initiative_id")
            .eq("metric_type", "outcome_hypothesis")
            .in("initiative_id", initIds);

          const metricIds = (metrics ?? []).map((m) => m.id);
          const metricInitMap: Record<string, string> = {};
          for (const m of metrics ?? []) {
            metricInitMap[m.id] = m.initiative_id;
          }

          if (metricIds.length > 0) {
            const { data: readings } = await supabase
              .from("metric_readings")
              .select("metric_id, status_rag, reading_date")
              .in("metric_id", metricIds)
              .order("reading_date", { ascending: false });

            const seenMetrics = new Set<string>();
            for (const r of readings ?? []) {
              if (!seenMetrics.has(r.metric_id)) {
                seenMetrics.add(r.metric_id);
                const initId = metricInitMap[r.metric_id];
                if (initId && !statusMap[initId]) {
                  statusMap[initId] = r.status_rag;
                }
              }
            }
          }
        }

        // Step 4: fetch stage transitions
        const daysInStage: Record<string, number> = {};
        if (initIds.length > 0) {
          const { data: transitions } = await supabase
            .from("kanban_stage_transitions")
            .select("initiative_id, changed_at")
            .in("initiative_id", initIds)
            .order("changed_at", { ascending: false });

          const seen = new Set<string>();
          const today = referenceDate;
          for (const t of transitions ?? []) {
            if (!seen.has(t.initiative_id)) {
              seen.add(t.initiative_id);
              daysInStage[t.initiative_id] = Math.floor(
                (today.getTime() - new Date(t.changed_at).getTime()) /
                  (1000 * 60 * 60 * 24),
              );
            }
          }
        }

        const lbcOwners = await fetchInitiativeOwners(initIds);
        const ests = await fetchInitiativeEstimates(initIds, referenceDate);

        if (!isMounted) return;
        setInitiatives(initiatives);
        setProfileMap(profileMap);
        setLbcOwnerMap(lbcOwners);
        setStatusMap(statusMap);
        setDaysInStage(daysInStage);
        setEstimates(ests);
      } catch (e: any) {
        console.error("P panel error:", e?.message ?? e);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPData();

    return () => {
      isMounted = false;
    };
  }, [clientId, referenceDate]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        <ColumnSkeletons />
        <ColumnSkeletons />
        <ColumnSkeletons />
      </div>
    );
  }
  if (error) return <ErrorMessage />;

  const enrichedInitiatives = initiatives.map((i) => ({
    ...i,
    ownerName: lbcOwnerMap[i.id] ?? i.owner_name ?? null,
    status: statusMap[i.id] ?? null,
    daysInStage: daysInStage[i.id] ?? null,
    estimate: estimates[i.id] ?? null,
  }));

  const ready = enrichedInitiatives.filter((i) => i.stage === "ready");
  const inDelivery = enrichedInitiatives.filter((i) => i.stage === "in_delivery");
  const deployed = enrichedInitiatives.filter((i) =>
    i.stage === "deployed"
  );

  const cols: Array<{
    label: string;
    headerCls: string;
    items: PInitiative[];
    empty: string;
  }> = [
    {
      label: "Ready",
      headerCls: "bg-blue-50 text-blue-700",
      items: ready,
      empty: "No initiatives in ready state yet",
    },
    {
      label: "In Delivery",
      headerCls: "bg-emerald-50 text-emerald-700",
      items: inDelivery,
      empty: "No initiatives in delivery yet",
    },
    {
      label: "Deployed",
      headerCls: "bg-muted text-muted-foreground",
      items: deployed,
      empty: "No deployed initiatives yet",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {cols.map((c) => (
          <div
            key={c.label}
            className="border border-border rounded-lg overflow-hidden"
          >
            <div
              className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${c.headerCls}`}
            >
              <span className="text-[10px] font-medium">{c.label}</span>
              <span
                className={`text-[9px] px-1.5 py-px rounded ${c.headerCls}`}
              >
                {c.items.length}
              </span>
            </div>
            {c.items.length === 0 ? (
              <EmptyStateMessage message={c.empty} />
            ) : (
              c.items.map((it, idx) => (
                <PCard key={it.id} it={it} idx={idx} />
              ))
            )}
          </div>
        ))}
      </div>

      <XMatrixCard
        clientId={clientId}
        settings={
          settings
            ? {
                ...settings,
                xmatrix_pdf_url: pdfUrl,
                xmatrix_pdf_filename: pdfFilename,
                xmatrix_pdf_uploaded_at: pdfUploadedAt,
              }
            : null
        }
        onPdfUploaded={(url, filename) => {
          setPdfUrl(url);
          setPdfFilename(filename);
          setPdfUploadedAt(url ? new Date().toISOString() : null);
        }}
      />
    </>
  );
}

function XMatrixCard({
  clientId,
  settings,
  onPdfUploaded,
}: {
  clientId: string;
  settings: ExecDashboardSettings | null;
  onPdfUploaded: (url: string | null, filename: string | null) => void;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();
      if (!cancelled) setIsAdmin((profile as any)?.role === "admin");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Please select a PDF file");
      return;
    }
    if (file.size > 10485760) {
      toast.error("PDF must be under 10MB");
      return;
    }
    setUploading(true);
    try {
      const path = `${clientId}/xmatrix-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("xmatrix-pdfs")
        .upload(path, file, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadError) {
        toast.error(uploadError.message);
        return;
      }
      const { error: updateError } = await supabase
        .from("executive_dashboard_settings")
        .update({
          xmatrix_pdf_url: path,
          xmatrix_pdf_filename: file.name,
          xmatrix_pdf_uploaded_at: new Date().toISOString(),
        })
        .eq("client_id", clientId);
      if (updateError) {
        toast.error(updateError.message);
        return;
      }
      onPdfUploaded(path, file.name);
      toast.success("X-Matrix PDF uploaded successfully");
    } finally {
      setUploading(false);
    }
  };

  const handleOpenPdf = async () => {
    const storedPath = settings?.xmatrix_pdf_url;
    if (!storedPath) return;
    const { data, error } = await supabase.storage
      .from("xmatrix-pdfs")
      .createSignedUrl(storedPath, 3600);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open PDF");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleRemovePdf = async () => {
    if (!confirm("Remove the uploaded X-Matrix PDF?")) return;
    const { error } = await supabase
      .from("executive_dashboard_settings")
      .update({
        xmatrix_pdf_url: null,
        xmatrix_pdf_filename: null,
        xmatrix_pdf_uploaded_at: null,
      })
      .eq("client_id", clientId);
    if (error) {
      toast.error(error.message);
      return;
    }
    onPdfUploaded(null, null);
    toast.success("X-Matrix PDF removed");
  };

  const hiddenInput = (
    <input
      type="file"
      accept="application/pdf"
      style={{ display: "none" }}
      ref={fileInputRef}
      onChange={handleFileSelect}
    />
  );

  const pdfUrl = settings?.xmatrix_pdf_url ?? null;
  const hasPdf = !!pdfUrl;

  if (!hasPdf) {
    return (
      <>
        <div className="mt-3 border border-blue-200 rounded-lg p-3 bg-blue-50/40 flex items-center justify-between cursor-default hover:bg-blue-50/70 transition-colors">
          <div>
            <div className="text-[10px] font-medium text-blue-700">
              <Network size={14} className="text-blue-600 inline mr-1.5" />
              X-Matrix — Annual Business Plan
            </div>
            <span className="text-[9px] text-blue-500 block mt-0.5">
              Strategy → improvement priority → KPI → initiative traceability
            </span>
          </div>
          <div className="flex items-center gap-2">
            {uploading ? (
              <div className="flex items-center gap-1.5 text-[10px] text-blue-600">
                <Loader2 size={12} className="animate-spin" />
                Uploading...
              </div>
            ) : isAdmin ? (
              <button
                className="text-[10px] border border-dashed border-blue-300 text-blue-500 bg-transparent px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload PDF
              </button>
            ) : null}
          </div>
        </div>
        {hiddenInput}
      </>
    );
  }

  return (
    <>
      <div className="mt-3 border border-emerald-200 rounded-lg p-3 bg-emerald-50/40 flex items-center justify-between cursor-default">
      <div>
        <div className="text-[10px] font-medium text-emerald-700">
          <FileText size={14} className="text-emerald-600 inline mr-1.5" />
          X-Matrix — Annual Business Plan
        </div>
        {settings?.xmatrix_pdf_filename && (
          <span className="text-[9px] text-emerald-600 block mt-0.5">
            {settings.xmatrix_pdf_filename}
          </span>
        )}
        {settings?.xmatrix_pdf_uploaded_at && (
          <span className="text-[9px] text-emerald-500 block">
            Uploaded{" "}
            {format(new Date(settings.xmatrix_pdf_uploaded_at), "d MMM yyyy")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {uploading ? (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-700">
            <Loader2 size={12} className="animate-spin" />
            Uploading...
          </div>
        ) : (
          <>
            <button
              className="bg-emerald-600 text-white text-[10px] px-3 py-1.5 rounded hover:bg-emerald-700 transition-colors"
              onClick={() => handleOpenPdf()}
            >
              Open PDF ↗
            </button>
            {isAdmin && (
              <>
                <button
                  className="text-[10px] border border-emerald-300 text-emerald-600 bg-transparent px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace
                </button>
                <button
                  className="text-[10px] text-red-500 hover:text-red-700 px-1"
                  onClick={() => handleRemovePdf()}
                >
                  Remove
                </button>
              </>
            )}
          </>
        )}
      </div>
      </div>
      {hiddenInput}
    </>
  );
}

function PCard({ it, idx }: { it: PInitiative; idx: number }) {
  const sb = statusBadge(it.status);
  const hasOwner = !!it.ownerName;
  const avatarCls = hasOwner
    ? AVATAR_COLORS[idx % 4]
    : "bg-muted text-muted-foreground";
  return (
    <div className="border-t border-border py-2 px-2.5">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-medium text-muted-foreground">
            LBC-{it.display_id ?? "—"}
          </span>
          <span className={`text-[9px] px-1.5 rounded ${sb.cls}`}>
            {sb.label}
          </span>
        </div>
        {it.wsjf_score != null && (
          <span className="bg-[#1B4F72] text-white text-[9px] px-1.5 py-px rounded font-medium">
            {Number(it.wsjf_score).toFixed(1)}
          </span>
        )}
      </div>
      <div className="text-[11px] font-medium leading-snug mb-1 mt-0.5">
        {it.title}
      </div>
      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-px text-[11px] text-muted-foreground">
          <span>Owner: {hasOwner ? it.ownerName : "Unassigned"}</span>
          {it.estimate && (it.estimate.mvpLabel || it.estimate.fullLabel) && (
            <span>
              {it.estimate.mvpDelivered ? (
                <span className="text-emerald-600 font-medium">MVP delivered</span>
              ) : (
                it.estimate.mvpLabel
              )}
              {it.estimate.fullLabel ? (
                <>
                  {" · "}
                  {it.estimate.fullLabel}
                </>
              ) : null}
            </span>
          )}
          <span>
            {it.daysInStage != null ? `${it.daysInStage}d` : "–"} in{" "}
            {STAGE_LABEL[it.stage] ?? it.stage}
          </span>
        </div>
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium ${avatarCls}`}
        >
          {hasOwner ? initialsFor(it.ownerName) : "?"}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// O CONTENT — Options pipeline
// ─────────────────────────────────────────────────────────

interface OInitiative {
  id: string;
  display_id: number | null;
  title: string;
  stage: string;
  wsjf_score: number | null;
  owner_id: string | null;
  ownerName: string | null;
  targetText: string;
  budget: number | null;
}

function OContent({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [initiatives, setInitiatives] = useState<OInitiative[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, { full_name: string }>>({});
  const [metricMap, setMetricMap] = useState<
    Record<string, { metric_name: string; target_value: number | null; target_unit: string | null }>
  >({});
  const [budgetMap, setBudgetMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let isMounted = true;

    const fetchOData = async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: inits, error } = await supabase
          .from("initiatives")
          .select("id, title, stage, wsjf_score, owner_id, display_id")
          .eq("client_id", clientId)
          .in("stage", ["funnel", "review", "analysis"])
          .order("title", { ascending: true });
        if (error) throw error;

        const initiatives = (inits ?? []) as OInitiative[];
        console.log("O panel initiatives:", initiatives.length, initiatives);

        const ownerIds = [
          ...new Set(initiatives.map((i) => i.owner_id).filter(Boolean)),
        ] as string[];

        const profileMap: Record<string, { full_name: string }> = {};
        if (ownerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ownerIds);

          for (const p of profiles ?? []) profileMap[p.id] = p;
        }

        const initIds = initiatives.map((i) => i.id);
        const metricMap: Record<
          string,
          { metric_name: string; target_value: number | null; target_unit: string | null }
        > = {};
        const budgetMap: Record<string, number> = {};

        if (initIds.length > 0) {
          const { data: metrics } = await supabase
            .from("initiative_metrics")
            .select("id, initiative_id, metric_name, target_value, target_unit")
            .eq("metric_type", "outcome_hypothesis")
            .in("initiative_id", initIds);

          for (const m of metrics ?? []) {
            if (!metricMap[m.initiative_id]) metricMap[m.initiative_id] = m;
          }

          const { data: budgets } = await supabase
            .from("initiative_budget_settings")
            .select("initiative_id, approved_budget_mvp")
            .in("initiative_id", initIds);

          for (const b of budgets ?? []) {
            budgetMap[b.initiative_id] = b.approved_budget_mvp;
          }
        }

        if (!isMounted) return;
        setInitiatives(initiatives);
        setProfileMap(profileMap);
        setMetricMap(metricMap);
        setBudgetMap(budgetMap);
      } catch (e: any) {
        console.error("O panel error:", e?.message ?? e);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOData();

    return () => {
      isMounted = false;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        <ColumnSkeletons />
        <ColumnSkeletons />
        <ColumnSkeletons />
      </div>
    );
  }
  if (error) return <ErrorMessage />;

  const enrichedInitiatives = initiatives.map((i) => {
    const metric = metricMap[i.id];
    return {
      ...i,
      ownerName: i.owner_id ? profileMap[i.owner_id]?.full_name ?? null : null,
      targetText:
        metric?.target_value != null
          ? `${metric.target_value} ${metric.target_unit ?? ""}`.trim()
          : "TBC",
      budget: budgetMap[i.id] ?? null,
    };
  });

  const funnel = enrichedInitiatives.filter((i) => i.stage === "funnel");
  const review = enrichedInitiatives.filter((i) => i.stage === "review");
  const analysis = enrichedInitiatives.filter((i) => i.stage === "analysis");

  const cols: Array<{
    label: string;
    headerCls: string;
    items: OInitiative[];
    empty: string;
  }> = [
    {
      label: "Funnel",
      headerCls: "bg-amber-50 text-amber-700",
      items: funnel,
      empty: "No initiatives in funnel yet",
    },
    {
      label: "Review",
      headerCls: "bg-blue-50 text-blue-700",
      items: review,
      empty: "No initiatives under review yet",
    },
    {
      label: "Analysis",
      headerCls: "bg-red-50/60 text-red-700",
      items: analysis,
      empty: "No initiatives in analysis yet",
    },
  ];

  const totalBudget = enrichedInitiatives.reduce(
    (a, i) => a + (i.budget ?? 0),
    0,
  );
  const hasBudget = enrichedInitiatives.some((i) => i.budget != null);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {cols.map((c) => (
          <div
            key={c.label}
            className="border border-border rounded-lg overflow-hidden"
          >
            <div
              className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${c.headerCls}`}
            >
              <span className="text-[10px] font-medium">{c.label}</span>
              <span
                className={`text-[9px] px-1.5 py-px rounded ${c.headerCls}`}
              >
                {c.items.length}
              </span>
            </div>
            {c.items.length === 0 ? (
              <EmptyStateMessage message={c.empty} />
            ) : (
              c.items.map((it, idx) => <OCard key={it.id} it={it} idx={idx} />)
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 bg-muted/30 rounded-lg p-2 text-[11px] text-muted-foreground">
        Pipeline: {initiatives.length} initiatives in evaluation
        {hasBudget &&
          ` · ${formatCurrency(totalBudget, "CAD")} CAD in assessment`}
      </div>
    </>
  );
}

function OCard({ it, idx }: { it: OInitiative; idx: number }) {
  const hasOwner = !!it.owner_id && !!it.ownerName;
  const avatarCls = hasOwner
    ? AVATAR_COLORS[idx % 4]
    : "bg-muted text-muted-foreground";
  return (
    <div className="border-t border-border py-2 px-2.5">
      <div className="flex justify-between items-start">
        <span className="text-[11px] text-muted-foreground">
          LBC-{it.display_id ?? "—"}
        </span>
        {it.wsjf_score != null ? (
          <span className="bg-[#1B4F72] text-white text-[9px] px-1.5 py-px rounded font-medium">
            {Number(it.wsjf_score).toFixed(1)}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">WSJF TBC</span>
        )}
      </div>
      <div className="text-[11px] font-medium leading-snug mb-1 mt-0.5">
        {it.title}
      </div>
      <div className="flex justify-between items-end">
        <div className="text-[11px] text-muted-foreground flex flex-col gap-px">
          <span>Owner: {hasOwner ? firstNameOf(it.ownerName) : "Unassigned"}</span>
          <span>Target: {it.targetText}</span>
          <span>
            Budget:{" "}
            {it.budget != null ? formatCurrency(it.budget, "CAD") : "TBC"}
          </span>
        </div>
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium ${avatarCls}`}
        >
          {hasOwner ? initialsFor(it.ownerName) : "?"}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// H CONTENT — Hotspots & constraints
// ─────────────────────────────────────────────────────────

interface AssetHot {
  id: string;
  name: string;
  total_co2e: number;
  intensity: number | null;
}

interface BlockerInit {
  id: string;
  title: string;
  stage: string;
  notes: string | null;
  days_in_stage: number | null;
}

interface OverdueMetric {
  id: string;
  metric_name: string;
  initiative_title: string;
  days_since_update: number | null;
}

function HContent({ clientId }: { clientId: string }) {
  const referenceDate = useReferenceDate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [assets, setAssets] = useState<AssetHot[]>([]);
  const [blockers, setBlockers] = useState<BlockerInit[]>([]);
  const [overdue, setOverdue] = useState<OverdueMetric[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchHData = async () => {
      setLoading(true);
      setError(false);
      try {
        // Assets - simple select, no complex filters
        const { data: assets, error: assetsError } = await supabase
          .from("assets")
          .select("id, name, asset_type, gross_floor_area")
          .eq("client_id", clientId);
        if (assetsError) console.error("assets error:", assetsError.message);

        const assetList = assets ?? [];
        const assetIds = assetList.map((a) => a.id);
        console.log("H assets:", assetList.length);

        // Emissions per asset
        const emissionsMap: Record<string, number> = {};
        if (assetIds.length > 0) {
          const { data: emissions } = await supabase
            .from("emissions")
            .select("asset_id, co2e_tonnes, reporting_year")
            .in("asset_id", assetIds);

          for (const e of emissions ?? []) {
            emissionsMap[e.asset_id] =
              (emissionsMap[e.asset_id] ?? 0) + (e.co2e_tonnes ?? 0);
          }
        }

        // Combine and sort
        const assetData = assetList
          .map((a) => ({
            ...a,
            total_co2e: emissionsMap[a.id] ?? 0,
            intensity: a.gross_floor_area
              ? (emissionsMap[a.id] ?? 0) / a.gross_floor_area
              : null,
          }))
          .sort((a, b) => b.total_co2e - a.total_co2e)
          .slice(0, 5);

        // Initiatives for blockers - NO kanban_stage filter
        const { data: initData } = await supabase
          .from("initiatives")
          .select("id, title, stage, display_id, notes")
          .eq("client_id", clientId);

        const blockerInits = (initData ?? []).filter(
          (i) => !["closed", "archive"].includes(i.stage),
        );
        const blockerIds = blockerInits.map((i) => i.id);
        console.log("H blockers:", blockerInits.length);

        // Stage transitions - NO enum filter
        const daysMap: Record<string, number> = {};
        if (blockerIds.length > 0) {
          const { data: transitions } = await supabase
            .from("kanban_stage_transitions")
            .select("initiative_id, changed_at")
            .in("initiative_id", blockerIds)
            .order("changed_at", { ascending: false });

          const seen = new Set<string>();
          const today = referenceDate;
          for (const t of transitions ?? []) {
            if (!seen.has(t.initiative_id)) {
              seen.add(t.initiative_id);
              daysMap[t.initiative_id] = Math.floor(
                (today.getTime() - new Date(t.changed_at).getTime()) /
                  (1000 * 60 * 60 * 24),
              );
            }
          }
        }

        // Overdue leading indicators
        const { data: initiativeRows } = await supabase
          .from("initiatives")
          .select("id")
          .eq("client_id", clientId);

        const { data: liMetrics } = await supabase
          .from("initiative_metrics")
          .select("id, metric_name, initiative_id, measurement_frequency")
          .eq("metric_type", "leading_indicator")
          .in("initiative_id", initiativeRows?.map((i) => i.id) ?? []);

        const liIds = (liMetrics ?? []).map((m) => m.id);
        const lastReadingMap: Record<string, string> = {};

        if (liIds.length > 0) {
          const { data: liReadings } = await supabase
            .from("metric_readings")
            .select("metric_id, reading_date")
            .in("metric_id", liIds)
            .order("reading_date", { ascending: false });

          for (const r of liReadings ?? []) {
            if (!lastReadingMap[r.metric_id]) {
              lastReadingMap[r.metric_id] = r.reading_date;
            }
          }
        }

        const today2 = referenceDate;
        const overdue = (liMetrics ?? []).filter((m) => {
          const lastDate = lastReadingMap[m.id];
          if (!lastDate) return true;
          const days = Math.floor(
            (today2.getTime() - new Date(lastDate).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (m.measurement_frequency === "weekly") return days > 7;
          if (m.measurement_frequency === "monthly") return days > 30;
          return false;
        });

        console.log("H overdue:", overdue.length);

        // Get initiative titles for overdue metrics
        const overdueInitIds = [...new Set(overdue.map((m) => m.initiative_id))];
        const initTitleMap: Record<string, string> = {};

        if (overdueInitIds.length > 0) {
          const { data: overdueInits } = await supabase
            .from("initiatives")
            .select("id, title")
            .in("id", overdueInitIds);

          for (const i of overdueInits ?? []) {
            initTitleMap[i.id] = i.title;
          }
        }

        if (!isMounted) return;
        setAssets(assetData);
        setBlockers(
          blockerInits
            .map((i: any) => ({
              id: i.id,
              title: i.title,
              stage: i.stage,
              notes: i.notes ?? null,
              days_in_stage: daysMap[i.id] ?? null,
            }))
            .sort((a, b) => (b.days_in_stage ?? 0) - (a.days_in_stage ?? 0))
            .slice(0, 4),
        );
        setOverdue(
          overdue.map((m) => ({
            ...m,
            initiative_title: initTitleMap[m.initiative_id] ?? "",
            days_since_update: lastReadingMap[m.id]
              ? Math.floor(
                  (today2.getTime() - new Date(lastReadingMap[m.id]).getTime()) /
                    (1000 * 60 * 60 * 24),
                )
              : null,
          })),
        );
      } catch (e: any) {
        console.error("H panel error:", e?.message ?? e);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHData();

    return () => {
      isMounted = false;
    };
  }, [clientId, referenceDate]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <ColumnSkeletons />
        <ColumnSkeletons />
      </div>
    );
  }
  if (error) return <ErrorMessage />;

  const maxCO2 = assets.reduce((a, b) => Math.max(a, b.total_co2e), 0) || 1;

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Left: top emitters */}
      <div>
        <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Top-emitting assets
        </div>
        {assets.length === 0 ? (
          <EmptyStateMessage message="No emissions data recorded yet" />
        ) : (
          assets.map((a) => {
            const barColor =
              (a.intensity ?? 0) > 150
                ? "bg-red-400"
                : (a.intensity ?? 0) > 100
                  ? "bg-amber-400"
                  : "bg-emerald-400";
            return (
              <div key={a.id} className="mb-3">
                <div className="text-[11px] font-medium mb-0.5">{a.name}</div>
                <div className="h-1.5 rounded-full bg-muted mb-0.5 overflow-hidden">
                  <div
                    className={`h-full ${barColor}`}
                    style={{
                      width: `${Math.round(
                        (100 * a.total_co2e) / maxCO2,
                      )}%`,
                    }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {a.total_co2e.toFixed(0)} tCO₂e ·{" "}
                  {a.intensity != null ? a.intensity.toFixed(1) : "–"}{" "}
                  kgCO₂e/m²
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Right: blockers */}
      <div>
        <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Delivery blockers
        </div>

        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <div className="text-[11px] text-muted-foreground">
              Initiatives by days in current stage
            </div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Days in Stage
            </div>
          </div>
          {blockers.length === 0 ? (
            <EmptyStateMessage message="No stage transition data yet" />
          ) : (
            blockers.map((b) => {
              const d = b.days_in_stage;
              const dCls =
                d != null && d > 30
                  ? "text-red-600"
                  : d != null && d > 14
                    ? "text-amber-600"
                    : "text-muted-foreground";
              return (
                <div
                  key={b.id}
                  className="flex justify-between items-start mb-1.5"
                >
                  <div className="flex flex-col max-w-[70%]">
                    <div className="flex items-center">
                      <span className="text-[12px] font-medium truncate">
                        {b.title}
                      </span>
                      <span
                        className={`text-[11px] ml-1 px-1 rounded ${stageBadgeCls(b.stage)}`}
                      >
                        {STAGE_LABEL[b.stage] ?? b.stage}
                      </span>
                    </div>
                    {b.notes && (
                      <span className="text-[11px] text-muted-foreground/80 mt-0.5">
                        {b.notes}
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] font-medium ${dCls}`}>
                    {d != null ? `${d}d` : "–"}
                  </span>
                </div>
              );
            })
          )}
        </div>


        <div>
          <div className="text-[11px] text-muted-foreground mb-1">
            Leading indicators not updated on schedule
          </div>
          {overdue.length === 0 ? (
            <EmptyStateMessage
              message="All leading indicators are current"
              className="!text-emerald-600"
            />
          ) : (
            overdue.map((m) => (
              <div key={m.id} className="mb-1.5">
                <div className="text-[10px] font-medium">{m.metric_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {m.initiative_title}
                </div>
                <span className="bg-red-50 text-red-700 text-[9px] px-1.5 rounded">
                  {m.days_since_update != null
                    ? `${m.days_since_update} days overdue`
                    : "Never updated"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// X CONTENT — Execution
// ─────────────────────────────────────────────────────────

interface ActiveSprint {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface XInitiative {
  id: string;
  display_id: number | null;
  title: string;
  stage: string;
  owner_id: string | null;
  ownerName: string | null;
  due_date: string | null;
  story_count: number;
  stories_done: number;
  estimate: InitiativeEstimate | null;
}

function XContent({ clientId }: { clientId: string }) {
  const referenceDate = useReferenceDate();
  const refDateIso = format(referenceDate, "yyyy-MM-dd");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSprint, setActiveSprint] = useState<ActiveSprint | null>(null);
  const [initiatives, setInitiatives] = useState<XInitiative[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const today = refDateIso;
        const { data: sprints } = await supabase
          .from("sprints")
          .select("id, name, start_date, end_date")
          .eq("client_id", clientId)
          .eq("is_committed", true)
          .lte("start_date", today)
          .gte("end_date", today)
          .limit(1);
        const sp = ((sprints as any[]) ?? [])[0] ?? null;

        const { data: inits } = await supabase
          .from("initiatives")
          .select("id, display_id, title, stage, wsjf_score, due_date, owner_id, owner_name")
          .eq("client_id", clientId)
          .in("stage", ["ready", "in_delivery", "deployed"]);
        console.log("[XContent] sprint/initiatives:", sp?.name, (inits as any[])?.length, inits);
        const rows = ((inits as any[]) ?? []).sort((a, b) => {
          const order: Record<string, number> = {
            in_delivery: 1,
            ready: 2,
            commissioned: 3,
            verified: 4,
          };
          return (order[a.stage] ?? 99) - (order[b.stage] ?? 99);
        });

        // Authoritative owner comes from lean_business_cases.initiative_owner_name
        const initIdsAll = rows.map((r) => r.id);
        const lbcOwners = await fetchInitiativeOwners(initIdsAll);
        const ests = await fetchInitiativeEstimates(initIdsAll, referenceDate);

        let storyByInit = new Map<string, { count: number; done: number }>();
        if (sp && rows.length > 0) {
          const { data: stories } = await supabase
            .from("kanban_stories")
            .select("initiative_id, stage")
            .eq("sprint_id", sp.id)
            .in("initiative_id", initIdsAll);
          for (const s of (stories as any[]) ?? []) {
            const cur = storyByInit.get(s.initiative_id) ?? {
              count: 0,
              done: 0,
            };
            cur.count += 1;
            if (s.stage === "done") cur.done += 1;
            storyByInit.set(s.initiative_id, cur);
          }
        }

        const result: XInitiative[] = rows.map((r) => {
          const sc = storyByInit.get(r.id) ?? { count: 0, done: 0 };
          return {
            id: r.id,
            display_id: r.display_id ?? null,
            title: r.title,
            stage: r.stage,
            owner_id: r.owner_id,
            ownerName: lbcOwners[r.id] ?? r.owner_name ?? null,
            due_date: r.due_date,
            story_count: sc.count,
            stories_done: sc.done,
            estimate: ests[r.id] ?? null,
          };
        });

        if (!isMounted) return;
        setActiveSprint(sp);
        setInitiatives(result);
      } catch (e) {
        console.error("[XContent] error", e);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [clientId, refDateIso]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (error) return <ErrorMessage />;

  if (initiatives.length === 0) {
    return <EmptyStateMessage message="No active delivery initiatives" />;
  }

  return (
    <div className="flex flex-col">
      {activeSprint && (
        <div className="mb-3 bg-emerald-50 rounded-lg px-3 py-2 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-emerald-700">
              {activeSprint.name}
            </span>
            <span className="text-[9px] text-emerald-600 ml-1">
              active · {format(new Date(activeSprint.start_date), "d MMM")} –{" "}
              {format(new Date(activeSprint.end_date), "d MMM yyyy")}
            </span>
          </div>
          <Calendar size={12} className="text-emerald-500" />
        </div>
      )}

      {initiatives.map((it) => {
        const isEarlyWin = it.stage === "deployed";
        const daysToMVP = it.due_date
          ? differenceInDays(new Date(it.due_date), referenceDate)
          : null;
        let mvpEl: React.ReactNode = null;
        if (daysToMVP != null) {
          if (daysToMVP < 0) {
            mvpEl = (
              <span className="text-[9px] text-red-600 font-medium">
                MVP overdue
              </span>
            );
          } else if (daysToMVP <= 7) {
            mvpEl = (
              <span className="text-[9px] text-red-600 font-medium">
                {daysToMVP}d to MVP
              </span>
            );
          } else if (daysToMVP <= 30) {
            mvpEl = (
              <span className="text-[9px] text-amber-600">
                {daysToMVP}d to MVP
              </span>
            );
          } else {
            mvpEl = (
              <span className="text-[9px] text-emerald-600">
                {daysToMVP}d to MVP
              </span>
            );
          }
        }

        const pct =
          it.story_count > 0
            ? Math.round((100 * it.stories_done) / it.story_count)
            : 0;
        const fillCls =
          pct >= 80
            ? "bg-emerald-400"
            : pct >= 40
              ? "bg-amber-400"
              : "bg-blue-400";

        return (
          <div key={it.id} className="border rounded-lg p-3 mb-2">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center">
                <span
                  className={`text-[9px] px-1.5 rounded ${stageBadgeCls(it.stage)}`}
                >
                  {STAGE_LABEL[it.stage] ?? it.stage}
                </span>
                <span className="text-[11px] font-medium ml-1.5">
                  {it.title}
                </span>
              </div>
              {mvpEl}
            </div>

            {isEarlyWin ? (
              <span className="bg-emerald-100 text-emerald-700 text-[9px] px-2 py-px rounded font-medium">
                Early win ✓
              </span>
            ) : (
              <>
                <div className="text-[11px] text-muted-foreground flex gap-3 mb-1.5">
                  <span>Owner: {it.ownerName ?? "Unassigned"}</span>
                  {activeSprint ? (
                    <>
                      <span>Sprint: {activeSprint.name}</span>
                      <span>
                        Stories: {it.stories_done}/{it.story_count} done
                      </span>
                    </>
                  ) : (
                    <span>No active sprint</span>
                  )}
                </div>
                {activeSprint && it.story_count > 0 && (
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${fillCls}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// E CONTENT — Economics & funding
// ─────────────────────────────────────────────────────────

interface ERow {
  id: string;
  display_id: number | null;
  title: string;
  stage: string;
  approvedBudget: number;
  budgetSource: "record" | "deployment" | "mvp" | "none";
  totalSpent: number;
  savingsAchieved: number | null;
  pctBudget: number;
  isOver: boolean;
  payback: number | null;
}

function EContent({
  clientId,
  settings,
}: {
  clientId: string;
  settings: ExecDashboardSettings | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rows, setRows] = useState<ERow[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: inits, error: e1 } = await supabase
          .from("initiatives")
          .select(
            "id, title, stage, display_id, mvp_cost, estimated_deployment_cost, estimated_annual_savings",
          )
          .eq("client_id", clientId);
        if (e1) throw e1;
        const initList = (inits as any[]) ?? [];
        const initIds = initList.map((i) => i.id);

        let budgets: any[] = [];
        let spend: any[] = [];
        let costMetrics: any[] = [];
        let costReadings: any[] = [];

        if (initIds.length > 0) {
          const [bRes, sRes, mRes] = await Promise.all([
            supabase
              .from("initiative_budget_settings")
              .select(
                "initiative_id, approved_budget_mvp, approved_budget_full, override_reason",
              )
              .in("initiative_id", initIds),
            supabase
              .from("initiative_actual_spend")
              .select("initiative_id, spend_amount, spend_category")
              .in("initiative_id", initIds),
            supabase
              .from("initiative_metrics")
              .select(
                "id, initiative_id, metric_name, target_value, target_unit, metric_category",
              )
              .eq("metric_type", "outcome_hypothesis")
              .eq("metric_category", "cost")
              .in("initiative_id", initIds),
          ]);
          budgets = (bRes.data as any[]) ?? [];
          spend = (sRes.data as any[]) ?? [];
          costMetrics = (mRes.data as any[]) ?? [];

          const costMetricIds = costMetrics.map((m) => m.id);
          if (costMetricIds.length > 0) {
            const { data: rd } = await supabase
              .from("metric_readings")
              .select("metric_id, reported_value, reading_date")
              .in("metric_id", costMetricIds)
              .order("reading_date", { ascending: false });
            costReadings = (rd as any[]) ?? [];
          }
        }

        const budgetByInit = new Map<string, number>();
        const hasBudgetRecord = new Set<string>();
        for (const b of budgets) {
          hasBudgetRecord.add(b.initiative_id);
          budgetByInit.set(
            b.initiative_id,
            Number(b.approved_budget_full) || 0,
          );
        }
        const spendByInit = new Map<string, number>();
        for (const s of spend) {
          spendByInit.set(
            s.initiative_id,
            (spendByInit.get(s.initiative_id) ?? 0) +
              (Number(s.spend_amount) || 0),
          );
        }
        const latestReadingByMetric = new Map<string, number>();
        for (const r of costReadings) {
          if (!latestReadingByMetric.has(r.metric_id)) {
            latestReadingByMetric.set(
              r.metric_id,
              Number(r.reported_value) || 0,
            );
          }
        }
        const savingsByInit = new Map<string, number>();
        for (const m of costMetrics) {
          const v = latestReadingByMetric.get(m.id);
          if (v != null) {
            savingsByInit.set(
              m.initiative_id,
              (savingsByInit.get(m.initiative_id) ?? 0) + v,
            );
          }
        }

        const result: ERow[] = initList.map((i) => {
          let approvedBudget = 0;
          let budgetSource: ERow["budgetSource"] = "none";
          if (hasBudgetRecord.has(i.id)) {
            approvedBudget = budgetByInit.get(i.id) ?? 0;
            budgetSource = "record";
          } else if (i.estimated_deployment_cost != null) {
            approvedBudget = Number(i.estimated_deployment_cost) || 0;
            budgetSource = "deployment";
          } else if (i.mvp_cost != null) {
            approvedBudget = Number(i.mvp_cost) || 0;
            budgetSource = "mvp";
          }
          const totalSpent = spendByInit.get(i.id) ?? 0;
          const savings = savingsByInit.has(i.id)
            ? savingsByInit.get(i.id)!
            : null;
          const pctBudget =
            approvedBudget > 0 ? (totalSpent / approvedBudget) * 100 : 0;
          const isOver = approvedBudget > 0 && totalSpent > approvedBudget;
          const payback =
            savings && savings > 0 ? approvedBudget / savings : null;
          return {
            id: i.id,
            display_id: i.display_id ?? null,
            title: i.title,
            stage: i.stage,
            approvedBudget,
            budgetSource,
            totalSpent,
            savingsAchieved: savings,
            pctBudget,
            isOver,
            payback,
          };
        });

        if (!mounted) return;
        setRows(result);
      } catch (e: any) {
        console.error("E panel error:", e?.message ?? e);
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [clientId]);

  if (loading) return <ColumnSkeletons />;
  if (error) return <ErrorMessage />;
  if (rows.length === 0)
    return <EmptyStateMessage message="No initiatives to display" />;

  const sumApproved = rows.reduce((a, r) => a + r.approvedBudget, 0);
  const sumSpent = rows.reduce((a, r) => a + r.totalSpent, 0);
  const sumSavings = rows.reduce((a, r) => a + (r.savingsAchieved ?? 0), 0);
  const paybacks = rows
    .map((r) => r.payback)
    .filter((p): p is number => p != null);
  const avgPayback =
    paybacks.length > 0
      ? paybacks.reduce((a, b) => a + b, 0) / paybacks.length
      : null;

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/30 text-muted-foreground font-medium text-[10px]">
            <tr>
              <th className="text-left p-1.5">Initiative</th>
              <th className="text-left p-1.5">Stage</th>
              <th className="text-right p-1.5">Approved budget</th>
              <th className="text-right p-1.5">Spent to date</th>
              <th className="text-left p-1.5">% used</th>
              <th className="text-right p-1.5">Annual savings</th>
              <th className="text-right p-1.5">Payback</th>
              <th className="text-left p-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const fillCls =
                r.pctBudget > 100
                  ? "bg-red-500"
                  : r.pctBudget > 80
                    ? "bg-amber-400"
                    : "bg-emerald-400";
              let statusCls = "bg-emerald-50 text-emerald-700";
              let statusLabel = "Within budget";
              if (r.isOver) {
                statusCls = "bg-red-50 text-red-700";
                statusLabel = "Over budget";
              } else if (r.pctBudget >= 90) {
                statusCls = "bg-amber-50 text-amber-700";
                statusLabel = "Near limit";
              } else if (r.budgetSource === "none") {
                statusCls = "bg-muted text-muted-foreground";
                statusLabel = "No budget set";
              }
              return (
                <tr key={r.id} className="border-b border-border">
                  <td className="p-1.5">
                    <div className="font-medium text-[11px]">{r.title}</div>
                    {r.display_id != null && (
                      <div className="text-[11px] text-muted-foreground">
                        LBC-{r.display_id}
                      </div>
                    )}
                  </td>
                  <td className="p-1.5">
                    <span
                      className={`text-[9px] px-1.5 rounded ${stageBadgeCls(r.stage)}`}
                    >
                      {STAGE_LABEL[r.stage] ?? r.stage}
                    </span>
                  </td>
                  <td className="p-1.5 text-right">
                    {r.budgetSource === "none" ? (
                      <span className="text-muted-foreground">Not set</span>
                    ) : (
                      <>
                        {formatCurrency(r.approvedBudget, "CAD")}
                        {(r.budgetSource === "deployment" ||
                          r.budgetSource === "mvp") && (
                          <span className="text-[8px] bg-muted text-muted-foreground px-1 rounded ml-1">
                            LBC estimate
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td
                    className={`p-1.5 text-right ${r.isOver ? "text-red-600" : ""}`}
                  >
                    {formatCurrency(r.totalSpent, "CAD")}
                  </td>
                  <td className="p-1.5">
                    <div className="flex items-center">
                      <div className="w-16 h-1.5 rounded bg-muted overflow-hidden">
                        <div
                          className={`h-full ${fillCls}`}
                          style={{
                            width: `${Math.min(r.pctBudget, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] ml-1">
                        {Math.round(r.pctBudget)}%
                      </span>
                    </div>
                  </td>
                  <td className="p-1.5 text-right">
                    {r.savingsAchieved != null
                      ? formatCurrency(r.savingsAchieved, "CAD")
                      : "–"}
                  </td>
                  <td className="p-1.5 text-right">
                    {r.payback != null ? `${r.payback.toFixed(1)} yrs` : "–"}
                  </td>
                  <td className="p-1.5">
                    <span className={`text-[9px] px-1.5 rounded ${statusCls}`}>
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-muted/30 rounded p-2 mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>Total approved: {formatCurrency(sumApproved, "CAD")}</span>
        <span>Total spent: {formatCurrency(sumSpent, "CAD")}</span>
        <span>Savings delivered: {formatCurrency(sumSavings, "CAD")}</span>
        {avgPayback != null && (
          <span>Avg payback: {avgPayback.toFixed(1)} yrs</span>
        )}
      </div>

      {settings?.carbon_price_current != null && (
        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/40 flex items-center gap-3 mt-3">
          <AlertCircle size={14} className="text-blue-600" />
          <div className="flex-1">
            <div className="text-[10px] font-medium text-blue-700">
              Carbon levy exposure
            </div>
            <div className="text-[14px] font-medium text-blue-700">
              {settings.currency_symbol}
              {formatCurrency(settings.carbon_exposure_current ?? 0, "")} →{" "}
              {formatCurrency(settings.carbon_exposure_target ?? 0, "")}{" "}
              {settings.currency_code}/yr
            </div>
            <div className="text-[9px] text-blue-500">
              @{settings.currency_symbol}
              {settings.carbon_price_current}/t current ·{" "}
              {settings.currency_symbol}
              {settings.carbon_price_target}/t legislated{" "}
              {settings.carbon_price_target_year}
            </div>
          </div>
          {settings.carbon_price_source && (
            <span className="text-[8px] bg-blue-100 text-blue-600 px-2 py-px rounded">
              {settings.carbon_price_source}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// N CONTENT — Networked delivery
// ─────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  sponsor: "Programme sponsor",
  financial_sponsor: "Financial sponsor",
  programme_lead: "Programme lead",
  delivery_lead: "Delivery lead",
  champion: "Champion",
  executive: "Executive",
  admin: "Administrator",
};

interface NKpiCard {
  metricId: string;
  metricName: string;
  targetValue: number | null;
  targetUnit: string | null;
  kpiId: string;
  kpiName: string;
  kpiTargetValue: number | null;
  kpiCurrentValue: number | null;
  dashboardComment: string | null;
  commentUpdatedAt: string | null;
  commentUpdatedBy: string | null;
  reading: {
    reported_value: number;
    status_rag: string | null;
    reading_date: string;
  } | null;
}

interface NMember {
  id: string;
  profile_id: string | null;
  function_role: string | null;
  full_name: string | null;
  initials: string | null;
  avatar_url: string | null;
}

function capitaliseRole(v: string | null | undefined): string {
  if (!v) return "";
  const mapped = ROLE_LABELS[v];
  if (mapped) return mapped;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function NContent({
  clientId,
  settings,
}: {
  clientId: string;
  settings: ExecDashboardSettings | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cards, setCards] = useState<NKpiCard[]>([]);
  const [members, setMembers] = useState<NMember[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: allInits, error: initsError } = await supabase
          .from("initiatives")
          .select("id")
          .eq("client_id", clientId);
        if (initsError) throw initsError;
        const allInitIds = ((allInits as any[]) ?? []).map((r: any) => r.id);
        console.log("N panel initIds:", allInitIds.length);

        let linkedMetrics: any[] = [];
        const kpiMap: Record<string, any> = {};
        const latestReadingMap: Record<string, any> = {};

        if (allInitIds.length > 0) {
          const { data: linked, error: linkedError } = await supabase
            .from("initiative_metrics")
            .select(
              "id, metric_name, target_value, target_unit, linked_xmatrix_kpi_id, initiative_id",
            )
            .eq("is_key_result", true)
            .not("linked_xmatrix_kpi_id", "is", null)
            .in("initiative_id", allInitIds);
          if (linkedError) throw linkedError;
          linkedMetrics = (linked as any[]) ?? [];
          console.log("N panel linked metrics:", linkedMetrics.length);

          const kpiIds = Array.from(
            new Set(
              linkedMetrics
                .map((m: any) => m.linked_xmatrix_kpi_id)
                .filter(Boolean),
            ),
          ) as string[];
          if (kpiIds.length > 0) {
            const { data: kpis, error: kpiError } = await supabase
              .from("xmatrix_kpis")
              .select(
                "id, name, target_value, current_value, dashboard_comment, comment_updated_at, comment_updated_by",
              )
              .in("id", kpiIds);
            if (kpiError) {
              console.error("N panel kpis error:", kpiError.message);
            }
            for (const k of (kpis as any[]) ?? []) kpiMap[k.id] = k;
          }

          const linkedMetricIds = linkedMetrics.map((m: any) => m.id);
          if (linkedMetricIds.length > 0) {
            const { data: readings, error: readingsError } = await supabase
              .from("metric_readings")
              .select("metric_id, reported_value, status_rag, reading_date")
              .in("metric_id", linkedMetricIds)
              .order("reading_date", { ascending: false });
            if (readingsError) {
              console.error(
                "N panel readings error:",
                readingsError.message,
              );
            }
            for (const r of (readings as any[]) ?? []) {
              const id = (r as any).metric_id as string;
              if (!latestReadingMap[id]) latestReadingMap[id] = r;
            }
          }
        }

        const cardsResult: NKpiCard[] = [];
        for (const m of linkedMetrics) {
          const kpi = kpiMap[m.linked_xmatrix_kpi_id];
          if (!kpi) continue;
          cardsResult.push({
            metricId: m.id,
            metricName: m.metric_name,
            targetValue: m.target_value,
            targetUnit: m.target_unit,
            kpiId: kpi.id,
            kpiName: kpi.name,
            kpiTargetValue: kpi.target_value ?? null,
            kpiCurrentValue: kpi.current_value ?? null,
            dashboardComment: kpi.dashboard_comment,
            commentUpdatedAt: kpi.comment_updated_at,
            commentUpdatedBy: kpi.comment_updated_by,
            reading: latestReadingMap[m.id] ?? null,
          });
        }

        const { data: tm2, error: membersError } = await supabase
          .from("team_members")
          .select("id, profile_id, full_name, function_role, initials")
          .eq("client_id", clientId);
        if (membersError) {
          console.error("N panel team members error:", membersError.message);
        }
        const teamMembers = (tm2 as any[]) ?? [];
        console.log("N panel team members:", teamMembers.length);

        const profileIds = Array.from(
          new Set(
            teamMembers.map((m: any) => m.profile_id).filter(Boolean),
          ),
        ) as string[];
        const avatarMap: Record<string, string> = {};
        if (profileIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, avatar_url")
            .in("id", profileIds);
          for (const p of (profs as any[]) ?? []) {
            if (p.avatar_url) avatarMap[p.id] = p.avatar_url;
          }
        }

        const memberRows: NMember[] = teamMembers.map((m: any) => ({
          id: m.id,
          profile_id: m.profile_id ?? null,
          function_role: m.function_role ?? null,
          full_name: m.full_name ?? null,
          initials: m.initials ?? null,
          avatar_url: m.profile_id ? avatarMap[m.profile_id] ?? null : null,
        }));

        if (!mounted) return;
        setCards(cardsResult);
        setMembers(memberRows);
      } catch (e: any) {
        console.error("N panel error:", e?.message ?? e);
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [clientId]);

  if (loading) return <ColumnSkeletons />;
  if (error) return <ErrorMessage />;

  return (
    <div className="flex flex-col">
      {cards.length === 0 ? (
        <EmptyStateMessage message="No key result metrics linked to X-Matrix KPIs yet. Link metrics via the LBC form." />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {cards.map((c) => {
            const reading = c.reading;
            const pct =
              reading && c.targetValue && c.targetValue > 0
                ? (Number(reading.reported_value) / c.targetValue) * 100
                : c.kpiCurrentValue != null &&
                    c.kpiTargetValue != null &&
                    c.kpiTargetValue > 0
                  ? (Number(c.kpiCurrentValue) / Number(c.kpiTargetValue)) *
                    100
                  : 0;
            const fill =
              reading?.status_rag === "on_track"
                ? "bg-emerald-400"
                : reading?.status_rag === "at_risk"
                  ? "bg-amber-400"
                  : reading?.status_rag === "off_track"
                    ? "bg-red-500"
                    : "bg-muted";
            const sb = statusBadge(reading?.status_rag);
            return (
              <div key={c.metricId} className="border rounded-lg p-3">
                <div className="text-[11px] font-medium mb-0.5">
                  {c.kpiName}
                </div>
                <div className="text-[11px] text-muted-foreground mb-2">
                  {c.metricName}
                </div>
                {reading ? (
                  <>
                    <div className="flex items-baseline">
                      <span className="text-[18px] font-medium">
                        {reading.reported_value} {c.targetUnit ?? ""}
                      </span>
                      <span className="text-[11px] text-muted-foreground ml-1">
                        / {c.targetValue ?? "–"} {c.targetUnit ?? ""} target
                      </span>
                    </div>
                    <div className="h-1 rounded bg-muted mb-1 overflow-hidden">
                      <div
                        className={`h-full ${fill}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className={`text-[9px] px-1.5 rounded ${sb.cls}`}>
                      {sb.label}
                    </span>
                  </>
                ) : (
                  <EmptyStateMessage message="No metric readings yet" />
                )}
                {c.dashboardComment && (
                  <div className="border-t border-border pt-1.5 mt-1.5 italic text-[11px] text-muted-foreground">
                    {c.dashboardComment}
                    {c.commentUpdatedAt && (
                      <span className="ml-1 not-italic">
                        · {format(new Date(c.commentUpdatedAt), "d MMM")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {members.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-2 flex flex-wrap items-center gap-3 mt-3">
          <span className="text-[9px] font-medium text-muted-foreground mr-1">
            Programme governance:
          </span>
          {members.map((m, idx) => (
            <div key={m.id} className="flex items-center gap-1.5">
              {m.avatar_url ? (
                <img
                  src={m.avatar_url}
                  alt={m.full_name ?? "member"}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-medium ${AVATAR_COLORS[idx % 4]}`}
                >
                  {m.initials ?? initialsFor(m.full_name)}
                </div>
              )}
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] font-medium">
                  {m.full_name ?? "Unknown"}
                </span>
                <span className="text-[8px] text-muted-foreground">
                  {capitaliseRole(m.function_role)}
                </span>
              </div>
            </div>
          ))}
          {(settings?.applicable_frameworks ?? []).map((fw) => (
            <span
              key={fw}
              className="text-[8px] bg-muted px-1.5 py-px rounded text-muted-foreground border border-border"
            >
              {fw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// I CONTENT — Implementation system
// ─────────────────────────────────────────────────────────

interface IRow {
  metricId: string;
  initiativeId: string;
  initiativeTitle: string;
  display_id: number | null;
  stage: string;
  due_date: string | null;
  owner_id: string | null;
  ownerName: string | null;
  metric_name: string;
  metric_category: string | null;
  baseline_value: number | null;
  baseline_unit: string | null;
  target_value: number | null;
  target_unit: string | null;
  measurement_method: string | null;
  update_frequency: string | null;
  latest: {
    reported_value: number;
    status_rag: string | null;
    reading_date: string;
  } | null;
  history: number[];
}

function categoryIcon(cat: string | null) {
  switch (cat) {
    case "carbon":
      return <Cloud size={10} />;
    case "energy":
      return <Zap size={10} />;
    case "cost":
      return <DollarSign size={10} />;
    case "water":
      return <Droplets size={10} />;
    case "risk":
      return <AlertTriangle size={10} />;
    default:
      return <Leaf size={10} />;
  }
}

function IContent({ clientId }: { clientId: string }) {
  const referenceDate = useReferenceDate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rows, setRows] = useState<IRow[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: inits } = await supabase
          .from("initiatives")
          .select("id, title, display_id, stage, due_date, owner_id, owner_name")
          .eq("client_id", clientId);
        const initList = ((inits as any[]) ?? []);
        const initIds = initList.map((i) => i.id);
        const initById = new Map(initList.map((i) => [i.id, i]));

        let ohMetrics: any[] = [];
        let allReadings: any[] = [];
        if (initIds.length > 0) {
          const { data: m } = await supabase
            .from("initiative_metrics")
            .select(
              "id, initiative_id, metric_name, metric_category, baseline_value, baseline_unit, target_value, target_unit, alert_threshold_pct, measurement_method, update_frequency",
            )
            .eq("metric_type", "outcome_hypothesis")
            .in("initiative_id", initIds);
          ohMetrics = (m as any[]) ?? [];

          const metricIds = ohMetrics.map((mm) => mm.id);
          if (metricIds.length > 0) {
            const { data: r } = await supabase
              .from("metric_readings")
              .select(
                "metric_id, reported_value, status_rag, reading_date, team_comment",
              )
              .in("metric_id", metricIds)
              .order("reading_date", { ascending: true });
            allReadings = (r as any[]) ?? [];
          }
        }

        const ownerIds = Array.from(
          new Set(initList.map((i) => i.owner_id).filter(Boolean)),
        ) as string[];
        let profiles: any[] = [];
        if (ownerIds.length > 0) {
          const { data: p } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ownerIds);
          profiles = (p as any[]) ?? [];
        }
        const profileMap = new Map(
          profiles.map((p) => [p.id, p.full_name as string]),
        );

        const lbcOwners = await fetchInitiativeOwners(initIds);

        const readingsByMetric = new Map<string, any[]>();
        for (const r of allReadings) {
          const arr = readingsByMetric.get(r.metric_id) ?? [];
          arr.push(r);
          readingsByMetric.set(r.metric_id, arr);
        }

        const result: IRow[] = ohMetrics.map((m) => {
          const init = initById.get(m.initiative_id) ?? ({} as any);
          const hist = readingsByMetric.get(m.id) ?? [];
          const latest = hist.length > 0 ? hist[hist.length - 1] : null;
          return {
            metricId: m.id,
            initiativeId: m.initiative_id,
            initiativeTitle: init.title ?? "",
            display_id: init.display_id ?? null,
            stage: init.stage ?? "",
            due_date: init.due_date ?? null,
            owner_id: init.owner_id ?? null,
            ownerName: lbcOwners[m.initiative_id] ?? init.owner_name ?? null,
            metric_name: m.metric_name,
            metric_category: m.metric_category,
            baseline_value: m.baseline_value,
            baseline_unit: m.baseline_unit,
            target_value: m.target_value,
            target_unit: m.target_unit,
            measurement_method: m.measurement_method,
            update_frequency: m.update_frequency,
            latest,
            history: hist
              .slice(-6)
              .map((r) => Number(r.reported_value) || 0),
          };
        });

        const order: Record<string, number> = {
          off_track: 0,
          at_risk: 1,
          on_track: 2,
        };
        result.sort((a, b) => {
          const ar = a.latest?.status_rag ?? null;
          const br = b.latest?.status_rag ?? null;
          return (
            (ar != null ? order[ar] ?? 3 : 3) -
            (br != null ? order[br] ?? 3 : 3)
          );
        });

        if (!mounted) return;
        setRows(result);
      } catch (e: any) {
        console.error("I panel error:", e?.message ?? e);
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [clientId]);

  if (loading) return <ColumnSkeletons />;
  if (error) return <ErrorMessage />;
  if (rows.length === 0)
    return <EmptyStateMessage message="No outcome hypothesis metrics yet" />;

  const today = referenceDate;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead className="sticky top-0 bg-white border-b border-border text-[10px] font-medium text-muted-foreground">
          <tr>
            <th className="text-left p-1.5">Initiative</th>
            <th className="text-left p-1.5">Metric</th>
            <th className="text-left p-1.5">Cat</th>
            <th className="text-right p-1.5">Baseline</th>
            <th className="text-right p-1.5">Target</th>
            <th className="text-right p-1.5">Latest</th>
            <th className="text-left p-1.5">% target</th>
            <th className="text-left p-1.5">Status</th>
            <th className="text-left p-1.5">Trend</th>
            <th className="text-left p-1.5">M&V</th>
            <th className="text-left p-1.5">Owner</th>
            <th className="text-left p-1.5">MVP</th>
            <th className="text-left p-1.5">Stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const sb = statusBadge(r.latest?.status_rag);
            const latestVal = r.latest ? Number(r.latest.reported_value) : null;
            const pct =
              latestVal == null
                ? 0
                : r.target_value != null && r.target_value > 0
                  ? (latestVal / r.target_value) * 100
                  : r.target_value === 0 && r.baseline_value != null && r.baseline_value !== 0
                    ? ((r.baseline_value - latestVal) / r.baseline_value) * 100
                    : 0;
            const fillCls =
              r.latest?.status_rag === "on_track"
                ? "bg-emerald-400"
                : r.latest?.status_rag === "at_risk"
                  ? "bg-amber-400"
                  : r.latest?.status_rag === "off_track"
                    ? "bg-red-500"
                    : "bg-muted";
            const stroke =
              r.latest?.status_rag === "on_track"
                ? "#1D9E75"
                : r.latest?.status_rag === "at_risk"
                  ? "#EF9F27"
                  : r.latest?.status_rag === "off_track"
                    ? "#E24B4A"
                    : "#94a3b8";

            // staleness
            let stale = false;
            if (r.latest && r.update_frequency) {
              const days = differenceInDays(
                today,
                new Date(r.latest.reading_date),
              );
              const threshold =
                r.update_frequency === "weekly"
                  ? 7
                  : r.update_frequency === "monthly"
                    ? 30
                    : r.update_frequency === "quarterly"
                      ? 90
                      : Infinity;
              stale = days > threshold;
            }

            // MVP color
            let mvpCls = "text-muted-foreground";
            let mvpStr = "–";
            if (r.due_date) {
              const d = new Date(r.due_date);
              mvpStr = format(d, "d MMM yy");
              const days = differenceInDays(d, today);
              if (days < 0) mvpCls = "text-red-600";
              else if (days <= 30) mvpCls = "text-amber-600";
            }

            // sparkline
            let spark: React.ReactNode = (
              <span className="text-muted-foreground">–</span>
            );
            if (r.history.length >= 2) {
              const min = Math.min(...r.history);
              const max = Math.max(...r.history);
              const range = max - min || 1;
              const w = 60;
              const h = 20;
              const step = w / (r.history.length - 1);
              const pts = r.history
                .map((v, i) => {
                  const x = i * step;
                  const y = 18 - ((v - min) / range) * 16;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ");
              spark = (
                <svg width={w} height={h}>
                  <polyline
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    points={pts}
                  />
                </svg>
              );
            }

            return (
              <tr key={r.metricId} className="border-b border-border">
                <td className="p-1.5">
                  <div className="font-medium text-[10px] truncate max-w-[100px]">
                    {r.initiativeTitle}
                  </div>
                  {r.display_id != null && (
                    <div className="text-[11px] text-muted-foreground">
                      LBC-{r.display_id}
                    </div>
                  )}
                </td>
                <td className="p-1.5">
                  <div className="text-[10px] truncate max-w-[120px]">
                    {r.metric_name}
                  </div>
                </td>
                <td className="p-1.5">
                  <span className="inline-flex items-center text-[9px] bg-muted/50 px-1 rounded">
                    {categoryIcon(r.metric_category)}
                  </span>
                </td>
                <td className="p-1.5 text-right">
                  {r.baseline_value ?? "–"} {r.baseline_unit ?? ""}
                </td>
                <td className="p-1.5 text-right">
                  {r.target_value ?? "–"} {r.target_unit ?? ""}
                </td>
                <td className="p-1.5 text-right">
                  {r.latest ? (
                    <span className="text-[11px] font-medium inline-flex items-center gap-1">
                      {r.latest.reported_value} {r.target_unit ?? ""}
                      {stale && (
                        <Clock size={10} className="text-red-500" />
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </td>
                <td className="p-1.5">
                  {r.latest ? (
                    <div>
                      <div className="w-14 h-1.5 rounded bg-muted overflow-hidden">
                        <div
                          className={`h-full ${fillCls}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="text-[10px]">{Math.round(pct)}%</div>
                    </div>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="p-1.5">
                  <span className={`text-[9px] px-1.5 rounded ${sb.cls}`}>
                    {sb.label}
                  </span>
                </td>
                <td className="p-1.5">{spark}</td>
                <td className="p-1.5">
                  {r.measurement_method ? (
                    <span
                      className="text-[11px] text-muted-foreground truncate max-w-[60px] inline-block"
                      title={r.measurement_method}
                    >
                      {r.measurement_method}
                    </span>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="p-1.5">
                  {r.ownerName ? (
                    <div
                      title={r.ownerName}
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium ${AVATAR_COLORS[idx % 4]}`}
                    >
                      {initialsFor(r.ownerName)}
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">
                      Unassigned
                    </span>
                  )}
                </td>
                <td className={`p-1.5 ${mvpCls}`}>{mvpStr}</td>
                <td className="p-1.5">
                  <span
                    className={`text-[9px] px-1.5 rounded ${stageBadgeCls(r.stage)}`}
                  >
                    {STAGE_LABEL[r.stage] ?? r.stage}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// CARBON & ENERGY ASSET PANELS
// ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  facility: "Facility",
  vehicle: "Vehicle",
  capital_good: "Capital Good",
  purchased_energy: "Purchased Energy",
  land: "Land",
  other: "Other",
};

interface AssetRow {
  id: string;
  name: string;
  asset_type: string | null;
  asset_category: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
  address?: string | null;
  gross_floor_area_m2: number | null;
  metadata: Record<string, any> | null;
}

function AssetCategoryTabs({
  categories,
  selected,
  onChange,
  counts,
  showByInitiative,
}: {
  categories: string[];
  selected: string;
  onChange: (cat: string) => void;
  counts: Record<string, number>;
  showByInitiative?: boolean;
}) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const tabCls = (active: boolean) =>
    `text-[11px] pb-1 px-2 border-b-2 ${
      active
        ? "border-[#1B4F72] text-[#1B4F72] font-medium"
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`;
  return (
    <div className="flex flex-row items-end gap-1 border-b border-border mb-3">
      {showByInitiative && (
        <button
          className={tabCls(selected === "by_initiative")}
          onClick={() => onChange("by_initiative")}
        >
          By Initiative
        </button>
      )}
      <button className={tabCls(selected === "all")} onClick={() => onChange("all")}>
        All
        <span className="text-[9px] bg-muted px-1.5 rounded ml-1">{total}</span>
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          className={tabCls(selected === cat)}
          onClick={() => onChange(cat)}
        >
          {CATEGORY_LABELS[cat] ?? cat}
          <span className="text-[9px] bg-muted px-1.5 rounded ml-1">
            {counts[cat] ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}

const STAGE_ORDER: Record<string, number> = {
  deployed: 0,
  in_delivery: 1,
  ready: 2,
  analysis: 3,
  review: 4,
  funnel: 5,
  closed: 6,
  archive: 7,
};

interface ByInitiativeMetricRow {
  initiative_id: string;
  display_id: number | null;
  initiative_title: string;
  stage: string;
  owner_name: string | null;
  metric_id: string;
  metric_name: string;
  baseline_value: number | null;
  baseline_unit: string | null;
  target_value: number | null;
  target_unit: string | null;
  latest_value: number | null;
  reading_count: number;
  last_updated: string | null;
}

function ByInitiativeMetricsPanel({
  clientId,
  category,
}: {
  clientId: string;
  category: "carbon" | "energy";
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [rows, setRows] = useState<ByInitiativeMetricRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: metrics, error: mErr } = await supabase
          .from("initiative_metrics")
          .select(
            "id, initiative_id, metric_name, baseline_value, baseline_unit, target_value, target_unit, initiatives!inner(id, title, stage, owner_name, display_id, client_id)"
          )
          .eq("metric_type", "outcome_hypothesis")
          .eq("metric_category", category)
          .eq("initiatives.client_id", clientId);
        if (mErr) throw mErr;
        const ms = (metrics ?? []) as any[];
        const ids = ms.map((m) => m.id);
        const readingMap: Record<
          string,
          { latest: number | null; count: number; lastDate: string | null }
        > = {};
        if (ids.length) {
          const { data: rs, error: rErr } = await supabase
            .from("metric_readings")
            .select("metric_id, reported_value, reading_date")
            .in("metric_id", ids);
          if (rErr) throw rErr;
          for (const r of rs ?? []) {
            const cur =
              readingMap[r.metric_id] ??
              { latest: null, count: 0, lastDate: null };
            cur.count += 1;
            const v = Number(r.reported_value);
            if (cur.latest == null || v > cur.latest) cur.latest = v;
            if (!cur.lastDate || r.reading_date > cur.lastDate)
              cur.lastDate = r.reading_date;
            readingMap[r.metric_id] = cur;
          }
        }
        const initIdsForOwners = Array.from(
          new Set(ms.map((m) => m.initiatives?.id).filter(Boolean)),
        ) as string[];
        const lbcOwners = await fetchInitiativeOwners(initIdsForOwners);
        const out: ByInitiativeMetricRow[] = ms.map((m) => {
          const init = m.initiatives;
          const rd = readingMap[m.id] ?? { latest: null, count: 0, lastDate: null };
          return {
            initiative_id: init.id,
            display_id: init.display_id,
            initiative_title: init.title,
            stage: init.stage,
            owner_name: lbcOwners[init.id] ?? init.owner_name,
            metric_id: m.id,
            metric_name: m.metric_name,
            baseline_value: m.baseline_value,
            baseline_unit: m.baseline_unit,
            target_value: m.target_value,
            target_unit: m.target_unit,
            latest_value: rd.latest,
            reading_count: rd.count,
            last_updated: rd.lastDate,
          };
        });
        out.sort((a, b) => {
          const sa = STAGE_ORDER[a.stage] ?? 99;
          const sb = STAGE_ORDER[b.stage] ?? 99;
          if (sa !== sb) return sa - sb;
          return (a.display_id ?? 0) - (b.display_id ?? 0);
        });
        if (!cancelled) setRows(out);
      } catch (e) {
        console.error("ByInitiative panel error", e);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, category]);

  if (loading) return <ColumnSkeletons />;
  if (error) return <ErrorMessage />;
  if (!rows.length)
    return (
      <EmptyStateMessage
        message={`No initiatives with ${category} outcome hypothesis metrics yet`}
      />
    );

  // Summary: deployed initiatives only
  const deployedRows = rows.filter((r) => r.stage === "deployed");
  let summary: ReactNode = null;
  if (category === "carbon") {
    const total = deployedRows.reduce(
      (s, r) => s + (r.latest_value ?? 0),
      0
    );
    const unit = deployedRows[0]?.target_unit ?? "tCO₂e";
    summary = (
      <span>
        Total verified carbon reduction:{" "}
        <strong>
          {total.toLocaleString()} {unit}
        </strong>{" "}
        <span className="text-muted-foreground">(Deployed initiatives only)</span>
      </span>
    );
  } else {
    const byUnit: Record<string, number> = {};
    for (const r of deployedRows) {
      const u = r.target_unit ?? "";
      byUnit[u] = (byUnit[u] ?? 0) + (r.latest_value ?? 0);
    }
    const parts = Object.entries(byUnit).map(
      ([u, v]) => `${v.toLocaleString()} ${u}`
    );
    summary = (
      <span>
        Total verified energy reduction:{" "}
        <strong>{parts.length ? parts.join(" · ") : "—"}</strong>{" "}
        <span className="text-muted-foreground">— deployed initiatives only</span>
      </span>
    );
  }

  // Group by initiative for display
  const seenInit = new Set<string>();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead className="sticky top-0 bg-white border-b border-border">
          <tr className="text-left text-muted-foreground">
            <th className="py-1 px-1">Initiative</th>
            <th className="py-1 px-1">Stage</th>
            <th className="py-1 px-1">Owner</th>
            <th className="py-1 px-1 text-right">Baseline</th>
            <th className="py-1 px-1 text-right">Target reduction</th>
            <th className="py-1 px-1 text-right">Latest actual</th>
            <th className="py-1 px-1">% of target</th>
            <th className="py-1 px-1 text-right">Readings</th>
            <th className="py-1 px-1">Last updated</th>
            <th className="py-1 px-1">Status</th>
          </tr>
        </thead>
        <tbody className="text-[11px]">
          {rows.map((r) => {
            const showInit = !seenInit.has(r.initiative_id);
            seenInit.add(r.initiative_id);
            const pctRaw =
              r.latest_value == null || r.target_value == null
                ? null
                : r.target_value > 0
                  ? (r.latest_value / r.target_value) * 100
                  : r.target_value === 0 && r.baseline_value != null && r.baseline_value !== 0
                    ? ((r.baseline_value - r.latest_value) / r.baseline_value) * 100
                    : null;
            const pct = pctRaw == null ? null : Math.min(100, pctRaw);
            const targetMet = pctRaw != null && pctRaw >= 100;
            let status: { cls: string; label: string };
            if (r.reading_count === 0)
              status = { cls: "bg-muted text-muted-foreground", label: "● No data" };
            else if (targetMet)
              status = { cls: "bg-emerald-50 text-emerald-700", label: "● On track" };
            else
              status = { cls: "bg-amber-50 text-amber-700", label: "● In progress" };
            return (
              <tr key={r.metric_id} className="border-b border-border/50">
                <td className="py-1 px-1 max-w-[220px]">
                  {showInit ? (
                    <div className="flex items-center gap-1.5">
                      {r.display_id != null && (
                        <span className="text-[9px] bg-muted px-1.5 py-px rounded font-medium">
                          LBC-{r.display_id}
                        </span>
                      )}
                      <span className="font-medium truncate">
                        {r.initiative_title}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground pl-2">↳ {r.metric_name}</span>
                  )}
                  {showInit && (
                    <div className="text-[11px] text-muted-foreground pl-1 mt-0.5">
                      {r.metric_name}
                    </div>
                  )}
                </td>
                <td className="py-1 px-1">
                  {showInit && (
                    <span
                      className={`text-[9px] px-1.5 py-px rounded ${stageBadgeCls(r.stage)}`}
                    >
                      {STAGE_LABEL[r.stage] ?? r.stage}
                    </span>
                  )}
                </td>
                <td className="py-1 px-1 text-[10px]">
                  {showInit ? r.owner_name ?? "—" : ""}
                </td>
                <td className="py-1 px-1 text-right">
                  {r.baseline_value != null
                    ? `${r.baseline_value.toLocaleString()} ${r.baseline_unit ?? ""}`
                    : "—"}
                </td>
                <td className="py-1 px-1 text-right">
                  {r.target_value != null
                    ? `${r.target_value.toLocaleString()} ${r.target_unit ?? ""}`
                    : "—"}
                </td>
                <td className="py-1 px-1 text-right">
                  {r.latest_value != null
                    ? `${r.latest_value.toLocaleString()} ${r.target_unit ?? ""}`
                    : "—"}
                </td>
                <td className="py-1 px-1">
                  {pct != null ? (
                    <div className="flex items-center gap-1.5 min-w-[110px]">
                      <div className="w-16 h-1.5 rounded bg-muted overflow-hidden">
                        <div
                          className={`h-full ${targetMet ? "bg-emerald-500" : "bg-amber-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px]">{pct.toFixed(0)}%</span>
                      {targetMet && (
                        <span className="text-[9px] text-emerald-700">Target met</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-1 px-1 text-right">{r.reading_count}</td>
                <td className="py-1 px-1 text-[10px]">
                  {r.last_updated
                    ? format(new Date(r.last_updated + "T00:00:00"), "MMM d, yyyy")
                    : "—"}
                </td>
                <td className="py-1 px-1">
                  <span className={`text-[9px] px-1.5 py-px rounded ${status.cls}`}>
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 text-[11px] bg-muted/30 rounded p-2 border border-border">
        {summary}
      </div>
    </div>
  );
}

function barColor(rank: number) {
  if (rank < 3) return "bg-red-400";
  if (rank < 6) return "bg-amber-400";
  return "bg-emerald-400";
}

function metaSubType(a: AssetRow) {
  return (a.metadata?.sub_type as string | undefined) ?? "–";
}

function metaMakeModel(a: AssetRow) {
  const mm = a.metadata?.make_model as string | undefined;
  if (mm) return mm;
  const mk = a.metadata?.make as string | undefined;
  const md = a.metadata?.model as string | undefined;
  if (mk || md) return `${mk ?? ""} ${md ?? ""}`.trim();
  return "–";
}

function locationText(a: AssetRow) {
  const cc = [a.city, a.country].filter(Boolean).join(", ");
  return cc || a.address || "–";
}

function intensityCls(v: number, hi: number, mid: number) {
  if (v > hi) return "text-red-600";
  if (v > mid) return "text-amber-600";
  return "text-emerald-600";
}

function CarbonAssetPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [emMap, setEmMap] = useState<
    Record<string, { scope1: number; scope2: number; total: number; year: number }>
  >({});
  const [selectedCat, setSelectedCat] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: aRows, error: aErr } = await supabase
          .from("assets")
          .select(
            "id, name, asset_type, asset_category, city, state_province, country, address, gross_floor_area_m2, metadata"
          )
          .eq("client_id", clientId)
          .eq("status", "active");
        if (aErr) throw aErr;
        const aList = (aRows ?? []) as AssetRow[];
        const ids = aList.map((a) => a.id);
        let emRows: any[] = [];
        if (ids.length) {
          const { data: eRows, error: eErr } = await supabase
            .from("emissions")
            .select("asset_id, scope, co2e_tonnes, reporting_year")
            .in("asset_id", ids)
            .in("scope", ["scope_1", "scope_2"])
            .order("reporting_year", { ascending: false });
          if (eErr) throw eErr;
          emRows = eRows ?? [];
        }
        const yearMap: Record<string, number> = {};
        for (const e of emRows) {
          const cur = yearMap[e.asset_id] ?? 0;
          if (e.reporting_year > cur) yearMap[e.asset_id] = e.reporting_year;
        }
        const map: Record<
          string,
          { scope1: number; scope2: number; total: number; year: number }
        > = {};
        for (const e of emRows) {
          if (e.reporting_year !== yearMap[e.asset_id]) continue;
          if (!map[e.asset_id])
            map[e.asset_id] = {
              scope1: 0,
              scope2: 0,
              total: 0,
              year: e.reporting_year,
            };
          if (e.scope === "scope_1")
            map[e.asset_id].scope1 += Number(e.co2e_tonnes);
          else map[e.asset_id].scope2 += Number(e.co2e_tonnes);
          map[e.asset_id].total =
            map[e.asset_id].scope1 + map[e.asset_id].scope2;
        }
        if (cancelled) return;
        setAssets(aList);
        setEmMap(map);
      } catch (err) {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) return <ColumnSkeletons />;
  if (error) return <ErrorMessage />;
  if (!assets.length)
    return <EmptyStateMessage message="No assets recorded yet" />;

  const counts: Record<string, number> = {};
  for (const a of assets) {
    const c = a.asset_category ?? "other";
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const cats = Object.keys(counts).filter((c) => counts[c] > 0);

  const filtered =
    selectedCat === "all"
      ? assets
      : assets.filter((a) => (a.asset_category ?? "other") === selectedCat);

  const portfolioTotal = assets.reduce(
    (s, a) => s + (emMap[a.id]?.total ?? 0),
    0
  );
  const sorted = [...filtered].sort(
    (a, b) => (emMap[b.id]?.total ?? 0) - (emMap[a.id]?.total ?? 0)
  );
  const maxTotal = Math.max(1, ...sorted.map((a) => emMap[a.id]?.total ?? 0));
  const assetsWithEm = assets.filter((a) => emMap[a.id]).length;
  const top = [...assets].sort(
    (a, b) => (emMap[b.id]?.total ?? 0) - (emMap[a.id]?.total ?? 0)
  )[0];
  const yearVotes: Record<number, number> = {};
  for (const a of assets) {
    const y = emMap[a.id]?.year;
    if (y) yearVotes[y] = (yearVotes[y] ?? 0) + 1;
  }
  const mostCommonYear =
    Object.entries(yearVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const showFacility =
    selectedCat === "facility" ||
    (selectedCat === "all" && cats.includes("facility"));
  const showVehicle =
    selectedCat === "vehicle" ||
    (selectedCat === "all" && cats.includes("vehicle"));
  const showCapital =
    selectedCat === "capital_good" ||
    (selectedCat === "all" && cats.includes("capital_good"));
  const showLand =
    selectedCat === "land" ||
    (selectedCat === "all" && cats.includes("land"));

  const rankMap = new Map<string, number>();
  [...assets]
    .sort((a, b) => (emMap[b.id]?.total ?? 0) - (emMap[a.id]?.total ?? 0))
    .forEach((a, i) => rankMap.set(a.id, i));

  return (
    <div>
      <div className="flex flex-row gap-4 mb-3 text-[10px] text-muted-foreground bg-muted/30 rounded p-2">
        <span>Total portfolio: {portfolioTotal.toFixed(0)} tCO₂e</span>
        <span>Assets with data: {assetsWithEm} of {assets.length}</span>
        {top && emMap[top.id] && (
          <span>
            Highest emitting: {top.name} ({emMap[top.id].total.toFixed(0)} tCO₂e)
          </span>
        )}
        <span>Reporting year: {mostCommonYear}</span>
      </div>
      <AssetCategoryTabs
        categories={cats}
        selected={selectedCat}
        onChange={setSelectedCat}
        counts={counts}
        showByInitiative
      />
      {selectedCat === "by_initiative" ? (
        <ByInitiativeMetricsPanel clientId={clientId} category="carbon" />
      ) : sorted.length === 0 ? (
        <EmptyStateMessage
          message={`No ${CATEGORY_LABELS[selectedCat] ?? selectedCat} assets recorded yet`}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-white border-b border-border">
              <tr className="text-left text-muted-foreground">
                <th className="py-1 px-1">Name</th>
                {showFacility && <th className="py-1 px-1">Sub-type</th>}
                {showFacility && <th className="py-1 px-1">City</th>}
                {showFacility && <th className="py-1 px-1">Country</th>}
                {showFacility && <th className="py-1 px-1 text-right">GFA</th>}
                {showVehicle && <th className="py-1 px-1">Sub-type</th>}
                {showVehicle && <th className="py-1 px-1">Make/Model</th>}
                {showCapital && <th className="py-1 px-1">Sub-type</th>}
                {showLand && <th className="py-1 px-1">Location</th>}
                <th className="py-1 px-1 text-right">Scope 1</th>
                <th className="py-1 px-1 text-right">Scope 2</th>
                <th className="py-1 px-1 text-right">Total tCO₂e</th>
                <th className="py-1 px-1 text-right">% portfolio</th>
                {showFacility && <th className="py-1 px-1 text-right">Intensity</th>}
                <th className="py-1 px-1">Share</th>
              </tr>
            </thead>
            <tbody className="text-[11px]">
              {sorted.map((a) => {
                const em = emMap[a.id];
                const total = em?.total ?? 0;
                const pct = portfolioTotal ? (total / portfolioTotal) * 100 : 0;
                const isFac = a.asset_category === "facility";
                const isVeh = a.asset_category === "vehicle";
                const isCap = a.asset_category === "capital_good";
                const isLand = a.asset_category === "land";
                const intensity =
                  isFac && a.gross_floor_area_m2
                    ? (total * 1000) / a.gross_floor_area_m2
                    : null;
                const rank = rankMap.get(a.id) ?? 99;
                return (
                  <tr key={a.id} className="border-b border-border/50">
                    <td className="py-1 px-1 font-medium max-w-[160px] truncate">
                      {a.name}
                    </td>
                    {showFacility && (
                      <td className="py-1 px-1 text-[10px] text-muted-foreground">
                        {isFac ? metaSubType(a) : ""}
                      </td>
                    )}
                    {showFacility && (
                      <td className="py-1 px-1 text-[10px]">
                        {isFac ? a.city ?? "–" : ""}
                      </td>
                    )}
                    {showFacility && (
                      <td className="py-1 px-1 text-[10px]">
                        {isFac ? a.country ?? "–" : ""}
                      </td>
                    )}
                    {showFacility && (
                      <td className="py-1 px-1 text-right text-[10px]">
                        {isFac && a.gross_floor_area_m2
                          ? `${a.gross_floor_area_m2.toLocaleString()} m²`
                          : ""}
                      </td>
                    )}
                    {showVehicle && (
                      <td className="py-1 px-1 text-[10px]">
                        {isVeh ? metaSubType(a) : ""}
                      </td>
                    )}
                    {showVehicle && (
                      <td className="py-1 px-1 text-[10px]">
                        {isVeh ? metaMakeModel(a) : ""}
                      </td>
                    )}
                    {showCapital && (
                      <td className="py-1 px-1 text-[10px]">
                        {isCap ? metaSubType(a) : ""}
                      </td>
                    )}
                    {showLand && (
                      <td className="py-1 px-1 text-[10px]">
                        {isLand ? locationText(a) : ""}
                      </td>
                    )}
                    <td className="py-1 px-1 text-right">
                      {em ? (
                        `${em.scope1.toFixed(1)} t`
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="py-1 px-1 text-right">
                      {em ? (
                        `${em.scope2.toFixed(1)} t`
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="py-1 px-1 text-right font-medium">
                      {em ? (
                        total.toFixed(1)
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="py-1 px-1 text-right">
                      {em ? (
                        `${pct.toFixed(1)}%`
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    {showFacility && (
                      <td className="py-1 px-1 text-right">
                        {intensity != null ? (
                          <span className={intensityCls(intensity, 100, 60)}>
                            {intensity.toFixed(1)} kgCO₂e/m²
                          </span>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </td>
                    )}
                    <td className="py-1 px-1">
                      <div className="w-24 h-2 rounded bg-muted overflow-hidden">
                        <div
                          className={`h-full ${barColor(rank)}`}
                          style={{
                            width: `${Math.min(100, (total / maxTotal) * 100)}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EnergyAssetPanel({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [enMap, setEnMap] = useState<
    Record<
      string,
      { electricity: number; natural_gas: number; other: number; total: number }
    >
  >({});
  const [selectedCat, setSelectedCat] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: aRows, error: aErr } = await supabase
          .from("assets")
          .select(
            "id, name, asset_type, asset_category, city, state_province, country, address, gross_floor_area_m2, metadata"
          )
          .eq("client_id", clientId)
          .eq("status", "active");
        if (aErr) throw aErr;
        const aList = (aRows ?? []) as AssetRow[];
        const ids = aList.map((a) => a.id);
        let enRows: any[] = [];
        if (ids.length) {
          const { data: eRows, error: eErr } = await supabase
            .from("energy_consumption")
            .select(
              "asset_id, fuel_type, quantity, unit, period_start, period_end"
            )
            .in("asset_id", ids)
            .order("period_end", { ascending: false });
          if (eErr) throw eErr;
          enRows = eRows ?? [];
        }
        const yearMap: Record<string, number> = {};
        for (const e of enRows) {
          const y = new Date(e.period_end).getFullYear();
          const cur = yearMap[e.asset_id] ?? 0;
          if (y > cur) yearMap[e.asset_id] = y;
        }
        const map: Record<
          string,
          {
            electricity: number;
            natural_gas: number;
            other: number;
            total: number;
          }
        > = {};
        for (const e of enRows) {
          const y = new Date(e.period_end).getFullYear();
          if (y !== yearMap[e.asset_id]) continue;
          if (!map[e.asset_id])
            map[e.asset_id] = {
              electricity: 0,
              natural_gas: 0,
              other: 0,
              total: 0,
            };
          const q = Number(e.quantity);
          if (e.fuel_type === "electricity" || e.fuel_type === "renewable_electricity")
            map[e.asset_id].electricity += q;
          else if (e.fuel_type === "natural_gas")
            map[e.asset_id].natural_gas += q;
          else map[e.asset_id].other += q;
          map[e.asset_id].total =
            map[e.asset_id].electricity +
            map[e.asset_id].natural_gas +
            map[e.asset_id].other;
        }
        if (cancelled) return;
        setAssets(aList);
        setEnMap(map);
      } catch (err) {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) return <ColumnSkeletons />;
  if (error) return <ErrorMessage />;
  if (!assets.length)
    return <EmptyStateMessage message="No assets recorded yet" />;

  const counts: Record<string, number> = {};
  for (const a of assets) {
    const c = a.asset_category ?? "other";
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const cats = Object.keys(counts).filter((c) => counts[c] > 0);

  const filtered =
    selectedCat === "all"
      ? assets
      : assets.filter((a) => (a.asset_category ?? "other") === selectedCat);

  const portfolioTotal = assets.reduce(
    (s, a) => s + (enMap[a.id]?.total ?? 0),
    0
  );
  const sorted = [...filtered].sort(
    (a, b) => (enMap[b.id]?.total ?? 0) - (enMap[a.id]?.total ?? 0)
  );
  const maxTotal = Math.max(1, ...sorted.map((a) => enMap[a.id]?.total ?? 0));
  const assetsWithEn = assets.filter((a) => enMap[a.id]).length;
  const top = [...assets].sort(
    (a, b) => (enMap[b.id]?.total ?? 0) - (enMap[a.id]?.total ?? 0)
  )[0];

  const showFacility =
    selectedCat === "facility" ||
    (selectedCat === "all" && cats.includes("facility"));
  const showVehicle =
    selectedCat === "vehicle" ||
    (selectedCat === "all" && cats.includes("vehicle"));
  const showCapital =
    selectedCat === "capital_good" ||
    (selectedCat === "all" && cats.includes("capital_good"));
  const showLand =
    selectedCat === "land" ||
    (selectedCat === "all" && cats.includes("land"));

  const anyOther = sorted.some((a) => (enMap[a.id]?.other ?? 0) > 0);

  const rankMap = new Map<string, number>();
  [...assets]
    .sort((a, b) => (enMap[b.id]?.total ?? 0) - (enMap[a.id]?.total ?? 0))
    .forEach((a, i) => rankMap.set(a.id, i));

  return (
    <div>
      <div className="flex flex-row gap-4 mb-3 text-[10px] text-muted-foreground bg-muted/30 rounded p-2">
        <span>Total portfolio: {(portfolioTotal / 1000).toFixed(0)} MWh</span>
        <span>Assets with data: {assetsWithEn} of {assets.length}</span>
        {top && enMap[top.id] && (
          <span>
            Highest consuming: {top.name} ({(enMap[top.id].total / 1000).toFixed(0)} MWh)
          </span>
        )}
      </div>
      <AssetCategoryTabs
        categories={cats}
        selected={selectedCat}
        onChange={setSelectedCat}
        counts={counts}
        showByInitiative
      />
      {selectedCat === "by_initiative" ? (
        <ByInitiativeMetricsPanel clientId={clientId} category="energy" />
      ) : sorted.length === 0 ? (
        <EmptyStateMessage
          message={`No ${CATEGORY_LABELS[selectedCat] ?? selectedCat} assets recorded yet`}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-white border-b border-border">
              <tr className="text-left text-muted-foreground">
                <th className="py-1 px-1">Name</th>
                {showFacility && <th className="py-1 px-1">Sub-type</th>}
                {showFacility && <th className="py-1 px-1">City</th>}
                {showFacility && <th className="py-1 px-1">Country</th>}
                {showFacility && <th className="py-1 px-1 text-right">GFA</th>}
                {showVehicle && <th className="py-1 px-1">Sub-type</th>}
                {showVehicle && <th className="py-1 px-1">Make/Model</th>}
                {showCapital && <th className="py-1 px-1">Sub-type</th>}
                {showLand && <th className="py-1 px-1">Location</th>}
                <th className="py-1 px-1 text-right">Electricity</th>
                <th className="py-1 px-1 text-right">Natural Gas</th>
                {anyOther && <th className="py-1 px-1 text-right">Other</th>}
                <th className="py-1 px-1 text-right">Total MWh</th>
                <th className="py-1 px-1 text-right">% portfolio</th>
                {showFacility && <th className="py-1 px-1 text-right">EUI</th>}
                <th className="py-1 px-1">Share</th>
              </tr>
            </thead>
            <tbody className="text-[11px]">
              {sorted.map((a) => {
                const en = enMap[a.id];
                const total = en?.total ?? 0;
                const pct = portfolioTotal ? (total / portfolioTotal) * 100 : 0;
                const isFac = a.asset_category === "facility";
                const isVeh = a.asset_category === "vehicle";
                const isCap = a.asset_category === "capital_good";
                const isLand = a.asset_category === "land";
                const eui =
                  isFac && a.gross_floor_area_m2
                    ? total / a.gross_floor_area_m2
                    : null;
                const rank = rankMap.get(a.id) ?? 99;
                return (
                  <tr key={a.id} className="border-b border-border/50">
                    <td className="py-1 px-1 font-medium max-w-[160px] truncate">
                      {a.name}
                    </td>
                    {showFacility && (
                      <td className="py-1 px-1 text-[10px] text-muted-foreground">
                        {isFac ? metaSubType(a) : ""}
                      </td>
                    )}
                    {showFacility && (
                      <td className="py-1 px-1 text-[10px]">
                        {isFac ? a.city ?? "–" : ""}
                      </td>
                    )}
                    {showFacility && (
                      <td className="py-1 px-1 text-[10px]">
                        {isFac ? a.country ?? "–" : ""}
                      </td>
                    )}
                    {showFacility && (
                      <td className="py-1 px-1 text-right text-[10px]">
                        {isFac && a.gross_floor_area_m2
                          ? `${a.gross_floor_area_m2.toLocaleString()} m²`
                          : ""}
                      </td>
                    )}
                    {showVehicle && (
                      <td className="py-1 px-1 text-[10px]">
                        {isVeh ? metaSubType(a) : ""}
                      </td>
                    )}
                    {showVehicle && (
                      <td className="py-1 px-1 text-[10px]">
                        {isVeh ? metaMakeModel(a) : ""}
                      </td>
                    )}
                    {showCapital && (
                      <td className="py-1 px-1 text-[10px]">
                        {isCap ? metaSubType(a) : ""}
                      </td>
                    )}
                    {showLand && (
                      <td className="py-1 px-1 text-[10px]">
                        {isLand ? locationText(a) : ""}
                      </td>
                    )}
                    <td className="py-1 px-1 text-right">
                      {en ? (
                        `${(en.electricity / 1000).toFixed(0)} MWh`
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="py-1 px-1 text-right">
                      {en ? (
                        `${(en.natural_gas / 1000).toFixed(0)} MWh`
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    {anyOther && (
                      <td className="py-1 px-1 text-right">
                        {en ? (
                          `${(en.other / 1000).toFixed(0)} MWh`
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </td>
                    )}
                    <td className="py-1 px-1 text-right font-medium">
                      {en ? (
                        (total / 1000).toFixed(0)
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="py-1 px-1 text-right">
                      {en ? (
                        `${pct.toFixed(1)}%`
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    {showFacility && (
                      <td className="py-1 px-1 text-right">
                        {eui != null ? (
                          <span className={intensityCls(eui, 250, 150)}>
                            {eui.toFixed(0)} kWh/m²
                          </span>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </td>
                    )}
                    <td className="py-1 px-1">
                      <div className="w-24 h-2 rounded bg-muted overflow-hidden">
                        <div
                          className={`h-full ${barColor(rank)}`}
                          style={{
                            width: `${Math.min(100, (total / maxTotal) * 100)}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
