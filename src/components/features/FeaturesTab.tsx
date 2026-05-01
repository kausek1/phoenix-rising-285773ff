import { useEffect, useState } from "react";
import { AlertCircle, CheckSquare, Layout } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { FeatureRow, FeatureStatus } from "@/types/features";

interface FeaturesTabProps {
  initiativeId: string;
  clientId: string;
}

const STATUS_STYLES: Record<FeatureStatus, { cls: string; label: string }> = {
  backlog: { cls: "bg-gray-100 text-gray-600", label: "Backlog" },
  in_progress: { cls: "bg-blue-50 text-blue-700", label: "In Progress" },
  done: { cls: "bg-green-50 text-green-700", label: "Done" },
  cancelled: { cls: "bg-red-50 text-red-500", label: "Cancelled" },
};

function StatusBadge({ status }: { status: FeatureStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.backlog;
  return (
    <span
      className={`${s.cls} text-xs font-medium px-2 py-0.5 rounded-full w-24 flex-shrink-0 text-center`}
    >
      {s.label}
    </span>
  );
}

function FeatureItem({ row, index }: { row: FeatureRow; index: number }) {
  const ac = (row.acceptance_criteria || "").trim();
  return (
    <div className="bg-white rounded-md border border-gray-100 px-3 py-2 mb-2 shadow-sm">
      <div className="flex items-start gap-3">
        <StatusBadge status={row.status} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 leading-snug">
            {row.title || <span className="italic text-gray-400">Untitled feature</span>}
          </div>
          {ac && (
            <div className="text-xs text-gray-500 mt-1 leading-relaxed">
              <CheckSquare className="w-3 h-3 inline mr-1 text-gray-400" />
              {ac}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-300 flex-shrink-0">{index + 1}</div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="font-semibold text-sm uppercase tracking-wide mb-3"
      style={{ color: "#1B4F72" }}
    >
      {children}
    </h3>
  );
}

export default function FeaturesTab({ initiativeId, clientId }: FeaturesTabProps) {
  const [rows, setRows] = useState<FeatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      const { data, error: err } = await supabase
        .from("features")
        .select("id, feature_type, title, acceptance_criteria, status, sort_order")
        .eq("initiative_id", initiativeId)
        .eq("client_id", clientId)
        .order("feature_type", { ascending: true })
        .order("sort_order", { ascending: true });

      if (cancelled) return;
      if (err) {
        setError(true);
        setRows([]);
      } else {
        setRows((data as FeatureRow[]) || []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initiativeId, clientId]);

  if (loading) {
    return (
      <div>
        <div className="bg-gray-100 rounded h-4 w-24 mb-3 animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-gray-100 rounded-md h-10 mb-2 animate-pulse" />
        ))}
        <div className="bg-gray-100 rounded h-4 w-24 mb-3 mt-4 animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={`b-${i}`} className="bg-gray-100 rounded-md h-10 mb-2 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-sm text-gray-500 py-4">
        <AlertCircle className="w-5 h-5 mx-auto mb-2 text-red-400" />
        <div>Features could not be loaded.</div>
        <div className="text-xs mt-1">Please close and reopen this panel to try again.</div>
      </div>
    );
  }

  const mvp = rows.filter((r) => r.feature_type === "mvp");
  const post = rows.filter((r) => r.feature_type === "post_mvp");

  if (rows.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500 py-6">
        <Layout className="w-8 h-8 mx-auto text-gray-300 mb-2" />
        <div>No features have been defined for this initiative yet.</div>
        <div className="text-xs mt-1">Features are added via the LBC form.</div>
      </div>
    );
  }

  return (
    <div>
      {mvp.length > 0 && (
        <section>
          <SectionHeader>MVP Features</SectionHeader>
          {mvp.length === 0 ? (
            <p className="italic text-sm text-gray-500">No MVP features defined.</p>
          ) : (
            mvp.map((r, i) => <FeatureItem key={r.id ?? `mvp-${i}`} row={r} index={i} />)
          )}
        </section>
      )}

      {mvp.length > 0 && post.length > 0 && (
        <div className="border-t border-gray-100 my-4" />
      )}

      {post.length > 0 && (
        <section>
          <SectionHeader>Post-MVP Features</SectionHeader>
          {post.length === 0 ? (
            <p className="italic text-sm text-gray-500">No Post-MVP features defined.</p>
          ) : (
            post.map((r, i) => <FeatureItem key={r.id ?? `post-${i}`} row={r} index={i} />)
          )}
        </section>
      )}
    </div>
  );
}
