"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { DataTable, type Column } from "../../../../components/ui/data-table";
import { useToast } from "../../../../components/ui/toast";
import { api, ApiError } from "../../../../lib/api";
import { td, t } from "../../../../lib/i18n";

type Kind = "STUDENTS" | "TEACHERS" | "PARENTS";
const KINDS: Kind[] = ["STUDENTS", "TEACHERS", "PARENTS"];

interface Preview {
  id: string;
  kind: Kind;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

interface Result {
  id: string;
  created: number;
  skipped: number;
  failed: Array<{ row: number; message: string }>;
  exports: Array<{ exportId: string; className: string }>;
}

interface ExportStatus {
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  downloadUrl: string | null;
}

interface Report {
  rows: Array<{
    row: number;
    status: string;
    result: string | null;
    errors: Array<{ field: string; message: string }>;
    message: string | null;
  }>;
}

const errorColumns = (): Column<{ row: number; field: string; message: string }>[] => [
  { key: "row", header: t("imports.colRow"), cell: (r) => r.row, numeric: true },
  { key: "field", header: t("imports.colField"), cell: (r) => r.field },
  { key: "message", header: t("imports.colMessage"), cell: (r) => r.message },
];

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Laporan hasil impor sebagai CSV (dibuat di browser dari laporan server). */
function downloadReport(report: Report) {
  const lines = [
    [t("imports.reportRow"), t("imports.reportResult"), t("imports.reportMessage")]
      .map(csvCell)
      .join(","),
  ];
  for (const r of report.rows) {
    const note = r.errors.length
      ? r.errors.map((e) => `${e.field}: ${e.message}`).join("; ")
      : (r.message ?? "");
    lines.push([String(r.row), r.result ?? r.status, note].map(csvCell).join(","));
  }
  const blob = new Blob([`${String.fromCharCode(0xfeff)}${lines.join("\r\n")}\r\n`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "laporan-impor.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function CardExport({ exportId, className }: { exportId: string; className: string }) {
  const status = useQuery({
    queryKey: ["export", exportId],
    queryFn: () => api<ExportStatus>(`/exports/${exportId}`),
    refetchInterval: (q) =>
      q.state.data?.status === "DONE" || q.state.data?.status === "FAILED" ? false : 2000,
  });
  const s = status.data?.status;
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 border-b border-line py-2 text-sm">
      <span className="font-semibold">
        {t("imports.cardsClass")} {className}
      </span>
      {s === "DONE" && status.data?.downloadUrl ? (
        <a
          href={status.data.downloadUrl}
          className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline"
        >
          <Download aria-hidden className="size-4" />
          {t("common.download")}
        </a>
      ) : s === "FAILED" ? (
        <span role="status" className="text-status-absent-fg">
          {t("master.cardsFailed")}
        </span>
      ) : (
        <span role="status" aria-live="polite" className="text-ink-2">
          {t("master.cardsPreparing")}
        </span>
      )}
    </li>
  );
}

export default function ImportPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("STUDENTS");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [validOnly, setValidOnly] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file!);
      return api<Preview>("/imports", { method: "POST", form });
    },
    onSuccess: (p) => {
      setPreview(p);
      setValidOnly(false);
      setResult(null);
      setError(null);
    },
    onError: (e) => {
      setPreview(null);
      setError(e instanceof ApiError ? e.message : t("common.genericError"));
    },
  });

  const commit = useMutation({
    mutationFn: () =>
      api<Result>(`/imports/${preview!.id}/commit`, {
        method: "POST",
        body: { validRowsOnly: validOnly },
      }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t("common.genericError")),
  });

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function report() {
    try {
      downloadReport(await api<Report>(`/imports/${result!.id}/report`));
      toast.show(t("imports.reportDone"));
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("common.genericError"));
    }
  }

  const blocked = preview !== null && preview.errorRows > 0 && !validOnly;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">{t("imports.title")}</h1>
        <p className="max-w-[70ch] text-body text-ink-2">{t("imports.intro")}</p>
      </header>

      {result ? (
        <section aria-labelledby="hasil" className="flex flex-col gap-4">
          <h2 id="hasil" className="text-h2">
            {t("imports.resultTitle")}
          </h2>
          <p role="status" className="text-body" data-testid="import-result">
            {t("imports.resultBody", {
              created: result.created,
              skipped: result.skipped,
              failed: result.failed.length,
            })}
          </p>
          {result.failed.length > 0 ? (
            <ul className="border-y border-line text-sm">
              {result.failed.map((f) => (
                <li key={f.row} className="border-b border-line py-2 last:border-b-0">
                  {t("imports.colRow")} {f.row}: {f.message}
                </li>
              ))}
            </ul>
          ) : null}
          {result.exports.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-h3">{t("imports.cardsTitle")}</h3>
              <p className="max-w-[70ch] text-sm text-ink-2">{t("imports.cardsBody")}</p>
              <ul>
                {result.exports.map((x) => (
                  <CardExport key={x.exportId} exportId={x.exportId} className={x.className} />
                ))}
              </ul>
            </div>
          ) : null}
          {kind === "TEACHERS" ? (
            <p className="text-sm text-ink-2">{t("imports.staffPasswordHint")}</p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void report()}>
              {t("imports.downloadReport")}
            </Button>
            <Button onClick={reset}>{t("imports.newImport")}</Button>
          </div>
        </section>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">{t("imports.kind")}</legend>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <label
                  key={k}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border px-4 text-sm ${kind === k ? "border-primary bg-primary-tint font-semibold text-primary" : "border-line-strong"}`}
                >
                  <input
                    type="radio"
                    name="kind"
                    className="size-4 accent-primary"
                    checked={kind === k}
                    onChange={() => {
                      setKind(k);
                      reset();
                    }}
                  />
                  {td(`imports.kind${k}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <section aria-labelledby="langkah1" className="flex flex-col gap-2">
            <h2 id="langkah1" className="text-h3">
              {t("imports.step1")}
            </h2>
            <div className="flex flex-wrap gap-4 text-sm font-semibold text-primary">
              <a
                className="inline-flex min-h-11 items-center gap-1 underline"
                href={`/api/imports/templates/${kind}?format=xlsx`}
              >
                <Download aria-hidden className="size-4" />
                {t("imports.templateXlsx")}
              </a>
              <a
                className="inline-flex min-h-11 items-center gap-1 underline"
                href={`/api/imports/templates/${kind}?format=csv`}
              >
                <Download aria-hidden className="size-4" />
                {t("imports.templateCsv")}
              </a>
            </div>
          </section>

          <section aria-labelledby="langkah2" className="flex flex-col gap-2">
            <h2 id="langkah2" className="text-h3">
              {t("imports.step2")}
            </h2>
            <label htmlFor="berkas" className="text-sm">
              {t("imports.chooseFile")}
            </label>
            <input
              id="berkas"
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
              className="min-h-11 text-sm file:mr-3 file:min-h-11 file:rounded-sm file:border file:border-line-strong file:bg-surface file:px-4 file:text-sm file:font-semibold"
            />
            <p className="text-caption text-ink-2">{t("imports.fileHint")}</p>
            <div>
              <Button loading={upload.isPending} disabled={!file} onClick={() => upload.mutate()}>
                {upload.isPending ? t("imports.uploading") : t("imports.upload")}
              </Button>
            </div>
          </section>

          {error ? (
            <p role="alert" className="text-sm text-status-absent-fg">
              {error}
            </p>
          ) : null}

          {preview ? (
            <section aria-labelledby="langkah3" className="flex flex-col gap-3">
              <h2 id="langkah3" className="text-h3">
                {t("imports.step3")}
              </h2>
              <p role="status" className="text-body" data-testid="import-summary">
                {preview.errorRows === 0
                  ? t("imports.allValid")
                  : t("imports.summary", {
                      total: preview.totalRows,
                      valid: preview.validRows,
                      errors: preview.errorRows,
                    })}
              </p>
              {preview.errors.length > 0 ? (
                <>
                  <h3 className="text-h3">{t("imports.errorsTitle")}</h3>
                  <DataTable
                    caption={t("imports.errorsTitle")}
                    columns={errorColumns()}
                    rows={preview.errors}
                    getRowId={(r) => `${r.row}-${r.field}-${r.message}`}
                  />
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 accent-primary"
                      checked={validOnly}
                      onChange={(e) => setValidOnly(e.target.checked)}
                    />
                    <span>
                      <span className="font-semibold">{t("imports.validOnly")}</span>
                      <br />
                      <span className="text-ink-2">{t("imports.validOnlyHint")}</span>
                    </span>
                  </label>
                </>
              ) : null}
              {blocked ? <p className="text-sm text-ink-2">{t("imports.mustCheck")}</p> : null}
              <div>
                <Button
                  loading={commit.isPending}
                  disabled={blocked || preview.validRows === 0}
                  onClick={() => commit.mutate()}
                >
                  {commit.isPending ? t("imports.committing") : t("imports.commit")}
                </Button>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
