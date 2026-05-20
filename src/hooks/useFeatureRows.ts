import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createBlankFeatureRow,
  type FeatureRow,
  type FeatureStatus,
  type FeatureType,
} from "@/types/features";

interface DBFeatureRow {
  id: string;
  feature_type: FeatureType;
  title: string;
  acceptance_criteria: string | null;
  status: FeatureStatus;
  sort_order: number;
  duration_months: number | null;
}

/**
 * Data layer for Initiative MVP / Post-MVP feature rows (Boxes 10 & 11
 * of the LBC form). Encapsulates fetch + targeted save (no bulk delete).
 *
 * UI terminology is always "Initiative" — the underlying table is an
 * implementation detail.
 */
export function useFeatureRows(clientId: string | null) {
  const [mvpRows, setMvpRows] = useState<FeatureRow[]>([
    createBlankFeatureRow("mvp", 0),
  ]);
  const [postMvpRows, setPostMvpRows] = useState<FeatureRow[]>([
    createBlankFeatureRow("post_mvp", 0),
  ]);
  // Set of feature UUIDs that existed in the DB when the form opened.
  // Used to detect deletions on save.
  const originalFeatureIdsRef = useRef<Set<string>>(new Set());

  /** Reset to a clean "new initiative" state. */
  const resetForNew = useCallback(() => {
    setMvpRows([createBlankFeatureRow("mvp", 0)]);
    setPostMvpRows([createBlankFeatureRow("post_mvp", 0)]);
    originalFeatureIdsRef.current = new Set();
  }, []);

  /** Load existing feature rows for an initiative (edit mode). */
  const fetchForInitiative = useCallback(
    async (initiativeId: string) => {
      if (!clientId) return;

      const { data, error } = await supabase
        .from("features")
        .select("id, feature_type, title, acceptance_criteria, status, sort_order, duration_months")
        .eq("initiative_id", initiativeId)
        .eq("client_id", clientId)
        .order("feature_type", { ascending: true })
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("[useFeatureRows] fetch error:", error);
        return;
      }

      const rows = (data ?? []) as DBFeatureRow[];
      const ids = new Set<string>();

      const mvp: FeatureRow[] = [];
      const post: FeatureRow[] = [];

      for (const r of rows) {
        ids.add(r.id);
        const row: FeatureRow = {
          id: r.id,
          feature_type: r.feature_type,
          title: r.title ?? "",
          acceptance_criteria: r.acceptance_criteria ?? "",
          status: r.status,
          sort_order: r.sort_order ?? 0,
          duration_months: r.duration_months ?? null,
        };
        if (r.feature_type === "mvp") mvp.push(row);
        else post.push(row);
      }

      originalFeatureIdsRef.current = ids;
      setMvpRows(mvp.length > 0 ? mvp : [createBlankFeatureRow("mvp", 0)]);
      setPostMvpRows(
        post.length > 0 ? post : [createBlankFeatureRow("post_mvp", 0)],
      );
    },
    [clientId],
  );

  /**
   * Persist all feature changes for the given initiative using three
   * targeted operations:
   *   1. DELETE rows that were in the DB but are no longer in state
   *   2. UPDATE existing rows (id != null)
   *   3. INSERT new rows (id == null) with non-empty titles
   *
   * IMPORTANT: never delete + re-insert all rows. Features will become
   * parents of Stories/Tasks; bulk-replacing on save would orphan them.
   */
  const saveForInitiative = useCallback(
    async (initiativeId: string) => {
      if (!clientId) return;

      // Re-stamp sort_order from current array position within each box.
      const stampedMvp = mvpRows.map((r, idx) => ({
        ...r,
        feature_type: "mvp" as const,
        sort_order: idx,
      }));
      const stampedPost = postMvpRows.map((r, idx) => ({
        ...r,
        feature_type: "post_mvp" as const,
        sort_order: idx,
      }));
      const allRows = [...stampedMvp, ...stampedPost];

      // ---- OPERATION 1: DELETE removed rows ----
      const currentIds = new Set(
        allRows.map((r) => r.id).filter((id): id is string => !!id),
      );
      const toDelete: string[] = [];
      originalFeatureIdsRef.current.forEach((origId) => {
        if (!currentIds.has(origId)) toDelete.push(origId);
      });

      for (const id of toDelete) {
        const { error } = await supabase
          .from("features")
          .delete()
          .eq("id", id)
          .eq("client_id", clientId);
        if (error) {
          console.error("[useFeatureRows] delete error:", id, error);
          throw error;
        }
      }

      // ---- OPERATION 2: UPDATE existing rows ----
      for (const r of allRows) {
        if (!r.id) continue;
        const ac = r.acceptance_criteria.trim();
        const { error } = await supabase
          .from("features")
          .update({
            title: r.title.trim(),
            acceptance_criteria: ac.length > 0 ? ac : null,
            status: r.status,
            sort_order: r.sort_order,
          })
          .eq("id", r.id)
          .eq("client_id", clientId);
        if (error) {
          console.error("[useFeatureRows] update error:", r.id, error);
          throw error;
        }
      }

      // ---- OPERATION 3: INSERT new rows ----
      const inserts = allRows
        .filter((r) => r.id === null && r.title.trim().length > 0)
        .map((r) => {
          const ac = r.acceptance_criteria.trim();
          return {
            client_id: clientId,
            initiative_id: initiativeId,
            feature_type: r.feature_type,
            title: r.title.trim(),
            acceptance_criteria: ac.length > 0 ? ac : null,
            status: r.status,
            sort_order: r.sort_order,
            owner_id: null,
            sprint_id: null,
            due_date: null,
          };
        });

      if (inserts.length > 0) {
        const { data: inserted, error } = await supabase
          .from("features")
          .insert(inserts)
          .select("id");
        if (error) {
          console.error("[useFeatureRows] insert error:", error);
          throw error;
        }
        // Refresh originalFeatureIds so subsequent saves in the same session
        // don't try to re-insert these as new rows.
        const newIds = new Set(originalFeatureIdsRef.current);
        (inserted ?? []).forEach((row: { id: string }) => newIds.add(row.id));
        originalFeatureIdsRef.current = newIds;
      }
    },
    [clientId, mvpRows, postMvpRows],
  );

  // ---- Validators (consumed by the form's save-button gate) ----
  const isMvpValid = useCallback(
    () => mvpRows.some((r) => r.title.trim().length > 0),
    [mvpRows],
  );
  const isPostMvpValid = useCallback(
    () => postMvpRows.some((r) => r.title.trim().length > 0),
    [postMvpRows],
  );

  return {
    mvpRows,
    setMvpRows,
    postMvpRows,
    setPostMvpRows,
    resetForNew,
    fetchForInitiative,
    saveForInitiative,
    isMvpValid,
    isPostMvpValid,
  };
}
