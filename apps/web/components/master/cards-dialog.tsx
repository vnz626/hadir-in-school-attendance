"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { t } from "../../lib/i18n";
import type { Row } from "../../lib/resources";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

interface ExportStatus {
  exportId: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  downloadUrl: string | null;
}

/**
 * Kartu masuk per kelas: meminta job EXPORT, memantau statusnya, lalu menawarkan unduhan lewat URL
 * bertanda tangan berumur pendek. Kata sandi tidak pernah lewat web; hanya ada di PDF.
 */
export function CardsDialog({ classRow, onClose }: { classRow: Row | null; onClose: () => void }) {
  const [exportId, setExportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: () =>
      api<{ exportId: string }>(`/classes/${classRow!.id}/credential-cards`, { method: "POST" }),
    onSuccess: (res) => setExportId(res.exportId),
    onError: (e) => setError(e instanceof ApiError ? e.message : t("common.genericError")),
  });

  useEffect(() => {
    if (!classRow) {
      setExportId(null);
      setError(null);
    }
  }, [classRow]);

  const status = useQuery({
    queryKey: ["export", exportId],
    enabled: exportId !== null,
    queryFn: () => api<ExportStatus>(`/exports/${exportId}`),
    refetchInterval: (q) =>
      q.state.data?.status === "DONE" || q.state.data?.status === "FAILED" ? false : 2000,
  });

  const state = status.data?.status;

  return (
    <Dialog
      open={classRow !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t("master.credentialCards")}
      description={classRow ? String(classRow.name) : undefined}
    >
      <div className="flex flex-col gap-3">
        {exportId === null ? (
          <>
            <p className="text-sm text-ink-2">{t("master.credentialCardsBody")}</p>
            {error ? (
              <p role="alert" className="text-sm text-status-absent-fg">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button loading={request.isPending} onClick={() => request.mutate()}>
                {t("master.credentialCards")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p role="status" aria-live="polite" className="text-body">
              {state === "DONE"
                ? t("master.cardsReady")
                : state === "FAILED"
                  ? t("master.cardsFailed")
                  : t("master.cardsPreparing")}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t("common.close2")}
              </Button>
              {state === "DONE" && status.data?.downloadUrl ? (
                <a
                  href={status.data.downloadUrl}
                  className="inline-flex h-11 items-center rounded-sm bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-press lg:h-10"
                >
                  {t("common.download")}
                </a>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
