import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatMetricValue, formatMetricUnitLabel } from "@/lib/utils";
import { ActualSpendLog } from "./ActualSpendLog";

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  initiativeId: string;
  initiativeDisplayId: number | null;
  initiativeTitle: string;
}

type RagStatus = "on_track" | "at_risk" | "off_track" | null;

interface MetricRow {
  id: string;
  metric_name: string;
  metric_type: "leading_indicator" | "outcome_hypothesis";
  target_value: number | null;
  target_unit: string | null;
  sort_order: number | null;
  alert_threshold_pct: number | null;
}

interface ReadingRow {
  metric_id: string;
  reported_value: number;
  status_rag: RagStatus;
  reading_date: string;
}

const DATA_SOURCES: { value: string; label: string }[] = [
  { value: "manual_entry", label: "Manual Entry" },
  { value: "bms", label: "BMS" },
  { value: "utility_bill", label: "Utility Bill" },
  { value: "iot_feed", label: "IoT Feed" },
  { value: "energy_star", label: "ENERGY STAR" },
  { value: "other", label: "Other" },
];

function lbcLabel(displayId: number | null): string {
  if (displayId == null) return "LBC-—";
  return "LBC-" + String(displayId).padStart(3, "0");
}

function ragBadge(status: RagStatus) {
  const cfg =
    status === "on_track"
      ? { bg: "#DCFCE7", color: "#16A34A", label: "On Track" }
      : status === "at_risk"
        ? { bg: "#FEF9C3", color: "#D97706", label: "At Risk" }
        : status === "off_track"
          ? { bg: "#FEE2E2", color: "#DC2626", label: "Off Track" }
          : { bg: "#F1F5F9", color: "#94a3b8", label: "No Data" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function calcRag(
  reportedValue: number,
  targetValue: number,
  alertThresholdPct: number,
): "on_track" | "at_risk" | "off_track" {
  const pctOfTarget = (reportedValue / targetValue) * 100;
  const deficit = 100 - pctOfTarget;
  if (deficit <= 0) return "on_track";
  if (deficit <= alertThresholdPct) return "at_risk";
  return "off_track";
}

export function MetricsPanel({
  open,
  onClose,
  clientId,
  initiativeId,
  initiativeDisplayId,
  initiativeTitle,
}: Props) {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [readingMap, setReadingMap] = useState<Map<string, ReadingRow>>(new Map());
  const [loading, setLoading] = useState(false);
  const [recordFor, setRecordFor] = useState<MetricRow | null>(null);

  const load = useCallback(async () => {
    if (!open || !clientId || !initiativeId) return;
    setLoading(true);
    try {
      const { data: mData, error: mErr } = await supabase
        .from("initiative_metrics")
        .select(
          "id, metric_name, metric_type, target_value, target_unit, sort_order, alert_threshold_pct",
        )
        .eq("initiative_id", initiativeId)
        .eq("client_id", clientId)
        .order("metric_type")
        .order("sort_order", { ascending: true });
      if (mErr) throw mErr;
      const ms = (mData as MetricRow[]) ?? [];
      setMetrics(ms);

      if (ms.length > 0) {
        const ids = ms.map((m) => m.id);
        const { data: rData } = await supabase
          .from("metric_readings")
          .select("metric_id, reported_value, status_rag, reading_date")
          .in("metric_id", ids)
          .eq("client_id", clientId)
          .order("reading_date", { ascending: false });
        const map = new Map<string, ReadingRow>();
        for (const r of (rData as ReadingRow[]) ?? []) {
          if (!map.has(r.metric_id)) map.set(r.metric_id, r);
        }
        setReadingMap(map);
      } else {
        setReadingMap(new Map());
      }
    } catch (e: any) {
      console.error("[MetricsPanel] load error", e);
      toast.error(e?.message ?? "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [open, clientId, initiativeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const indicators = useMemo(
    () => metrics.filter((m) => m.metric_type === "leading_indicator"),
    [metrics],
  );
  const outcomes = useMemo(
    () => metrics.filter((m) => m.metric_type === "outcome_hypothesis"),
    [metrics],
  );

  const handleRecorded = async () => {
    setRecordFor(null);
    await load();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent
          side="right"
          className="p-0 w-full sm:max-w-[520px] overflow-y-auto"
          style={{ maxWidth: 520 }}
        >
          <div className="px-6 py-5 border-b">
            <h2 className="text-lg font-semibold" style={{ color: "#1B4F72" }}>
              Initiative Metrics
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {lbcLabel(initiativeDisplayId)} — {initiativeTitle}
            </p>
          </div>
          <div className="px-6 py-4 space-y-6">
            {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!loading && metrics.length === 0 && (
              <p className="text-sm italic text-slate-400">
                No metrics defined for this initiative.
              </p>
            )}

            <Section
              title="Leading Indicators"
              subtitle="Weekly signals — updated by the team"
              metrics={indicators}
              readingMap={readingMap}
              onRecord={(m) => setRecordFor(m)}
            />

            <Section
              title="Outcome Hypotheses"
              subtitle="Long-term impact claims — verified at project completion"
              metrics={outcomes}
              readingMap={readingMap}
              onRecord={(m) => setRecordFor(m)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {recordFor && (
        <RecordReadingModal
          open={!!recordFor}
          onClose={() => setRecordFor(null)}
          onSubmitted={handleRecorded}
          metric={recordFor}
          clientId={clientId}
        />
      )}
    </>
  );
}

function Section({
  title,
  subtitle,
  metrics,
  readingMap,
  onRecord,
}: {
  title: string;
  subtitle: string;
  metrics: MetricRow[];
  readingMap: Map<string, ReadingRow>;
  onRecord: (m: MetricRow) => void;
}) {
  if (metrics.length === 0) return null;
  return (
    <div>
      <h3
        className="text-[13px] font-bold uppercase tracking-wide"
        style={{ color: "#1B4F72" }}
      >
        {title}
      </h3>
      <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
        {subtitle}
      </p>
      <div className="mt-3">
        {metrics.map((m, idx) => {
          const r = readingMap.get(m.id);
          return (
            <div
              key={m.id}
              className="flex items-start justify-between gap-3 py-3"
              style={{
                borderTop: idx === 0 ? "none" : "1px solid #F1F5F9",
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-[14px] font-bold"
                  style={{ color: "#1e293b" }}
                >
                  {m.metric_name}
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: r ? "#64748b" : "#94a3b8", fontStyle: r ? "normal" : "italic" }}>
                  {r
                    ? `${formatMetricValue(r.reported_value, m.target_unit)} on ${format(
                        new Date(r.reading_date + "T00:00:00"),
                        "MMM d, yyyy",
                      )}`
                    : "No readings yet"}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "#94a3b8" }}>
                  Target: {m.target_value != null ? formatMetricValue(m.target_value, m.target_unit) : "—"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                {ragBadge((r?.status_rag ?? null) as RagStatus)}
                <button
                  type="button"
                  onClick={() => onRecord(m)}
                  className="inline-flex items-center gap-1 rounded text-white"
                  style={{
                    background: "#0E7A65",
                    fontSize: 11,
                    padding: "4px 10px",
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Record Reading
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecordReadingModal({
  open,
  onClose,
  onSubmitted,
  metric,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  metric: MetricRow;
  clientId: string;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [readingDate, setReadingDate] = useState<string>(today);
  const [valueStr, setValueStr] = useState<string>("");
  const [dataSource, setDataSource] = useState<string>("manual_entry");
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const numericValue = Number(valueStr);
  const valueValid = valueStr !== "" && !Number.isNaN(numericValue) && numericValue > 0;
  const dateValid = readingDate <= today;

  const previewRag: RagStatus = useMemo(() => {
    if (!valueValid || metric.target_value == null || metric.target_value === 0) return null;
    const threshold = metric.alert_threshold_pct ?? 15;
    return calcRag(numericValue, metric.target_value, threshold);
  }, [valueValid, numericValue, metric.target_value, metric.alert_threshold_pct]);

  const canSubmit = valueValid && dateValid && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      const threshold = metric.alert_threshold_pct ?? 15;
      const status_rag =
        metric.target_value != null && metric.target_value !== 0
          ? calcRag(numericValue, metric.target_value, threshold)
          : null;
      const { error } = await supabase.from("metric_readings").insert({
        client_id: clientId,
        metric_id: metric.id,
        reading_date: readingDate,
        reported_value: numericValue,
        status_rag,
        data_source: dataSource,
        team_comment: comment.trim() ? comment.trim() : null,
        reported_by: userId,
      });
      if (error) throw error;
      toast.success(`Reading recorded for ${metric.metric_name}`);
      onSubmitted();
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to record reading. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const banner =
    previewRag === "on_track"
      ? { bg: "#DCFCE7", color: "#16A34A", text: "This reading will be recorded as ON TRACK" }
      : previewRag === "at_risk"
        ? { bg: "#FEF9C3", color: "#D97706", text: "This reading will be recorded as AT RISK" }
        : previewRag === "off_track"
          ? { bg: "#FEE2E2", color: "#DC2626", text: "This reading will be recorded as OFF TRACK" }
          : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Record Reading</DialogTitle>
          <p className="text-[14px]" style={{ color: "#1B4F72" }}>
            {metric.metric_name}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reading-date">Reading Date</Label>
            <Input
              id="reading-date"
              type="date"
              value={readingDate}
              max={today}
              onChange={(e) => setReadingDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reported-value">Reported Value</Label>
            <div className="flex items-center gap-2">
              <Input
                id="reported-value"
                type="number"
                step="any"
                min="0"
                value={valueStr}
                onChange={(e) => setValueStr(e.target.value)}
                className="text-right"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {formatMetricUnitLabel(metric.target_unit)}
              </span>
            </div>
          </div>

          {banner && (
            <div
              className="rounded px-3 py-2 text-[12px] font-medium"
              style={{ background: banner.bg, color: banner.color }}
            >
              {banner.text}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Data Source</Label>
            <Select value={dataSource} onValueChange={setDataSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATA_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-comment">Team Comment (optional)</Label>
            <Textarea
              id="team-comment"
              rows={4}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add context, caveats, or notes about this reading. This cannot change the RAG status."
            />
            <div className="text-[11px] text-muted-foreground text-right">
              {comment.length}/500
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-primary text-primary hover:bg-primary/5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Submit Reading
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
