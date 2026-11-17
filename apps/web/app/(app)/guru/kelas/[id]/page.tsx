"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../../../../components/ui/button";
import { DataTable, type Column } from "../../../../../components/ui/data-table";
import { Dialog } from "../../../../../components/ui/dialog";
import { ForbiddenState, ErrorState } from "../../../../../components/ui/state-panels";
import { useToast } from "../../../../../components/ui/toast";
import { CardsDialog } from "../../../../../components/master/cards-dialog";
import { api, ApiError } from "../../../../../lib/api";
import { td, t } from "../../../../../lib/i18n";
import type { Row } from "../../../../../lib/resources";

interface ClassDto {
  id: string;
  name: string;
  homeroomTeacherName: string | null;
}

interface StudentRow extends Row {
  name: string;
  nis: string;
  status: string;
}

/**
 * Daftar siswa satu kelas. Hanya wali kelas yang bisa mengatur ulang kata sandi dan mencetak kartu
 * masuk: server (AccessPolicy) yang memutuskan, tombolnya hanya kenyamanan.
 */
export default function TeacherClassPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [reset, setReset] = useState<StudentRow | null>(null);
  const [secret, setSecret] = useState<{ name: string; password: string } | null>(null);
  const [cards, setCards] = useState(false);

  const cls = useQuery({
    queryKey: ["class", id],
    queryFn: () => api<ClassDto>(`/classes/${id}`),
    retry: false,
  });
  const students = useQuery({
    queryKey: ["class-students", id],
    queryFn: () =>
      api<{ data: StudentRow[] }>("/students", { query: { classId: id, pageSize: 100 } }),
    enabled: cls.isSuccess,
  });

  const doReset = useMutation({
    mutationFn: (s: StudentRow) =>
      api<{ temporaryPassword: string }>(`/students/${s.id}/password-reset`, { method: "POST" }),
    onSuccess: (res, s) => {
      setReset(null);
      setSecret({ name: s.name, password: res.temporaryPassword });
    },
    onError: (e) => {
      setReset(null);
      toast.show(e instanceof ApiError ? e.message : t("common.genericError"));
    },
  });

  if (cls.error instanceof ApiError && cls.error.status === 403) return <ForbiddenState />;
  if (cls.isError) return <ErrorState onRetry={() => void cls.refetch()} />;

  const rows = students.data?.data ?? [];
  const isHomeroom = rows.length > 0 || students.isSuccess;

  const columns: Column<StudentRow>[] = [
    { key: "name", header: t("teacher.colName"), cell: (r) => r.name },
    { key: "nis", header: t("teacher.colNis"), cell: (r) => r.nis },
    {
      key: "status",
      header: t("teacher.colStatus"),
      cell: (r) => td(`options.student${r.status}`),
    },
    {
      key: "actions",
      header: t("common.actions"),
      mobileFull: true,
      cell: (r) => (
        <button
          type="button"
          onClick={() => setReset(r)}
          className="min-h-11 rounded-sm px-2 text-sm font-semibold text-primary hover:bg-primary-tint"
        >
          {t("master.resetPassword")}
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/guru/kelas"
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("common.back")}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{cls.data?.name ?? t("common.loading")}</h1>
          <p className="max-w-[70ch] text-body text-ink-2">
            {isHomeroom && rows.length > 0 ? t("teacher.homeroomNote") : t("teacher.readOnlyNote")}
          </p>
        </div>
        {rows.length > 0 ? (
          <Button variant="secondary" onClick={() => setCards(true)}>
            {t("master.credentialCards")}
          </Button>
        ) : null}
      </header>

      <h2 className="text-h2">{t("teacher.rosterTitle")}</h2>
      <DataTable
        caption={t("teacher.rosterTitle")}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        state={students.isLoading ? "loading" : students.isError ? "error" : "ready"}
        onRetry={() => void students.refetch()}
        emptyTitle={t("teacher.rosterTitle")}
        emptyDescription={t("teacher.rosterEmpty")}
      />

      <Dialog
        open={reset !== null}
        onOpenChange={(o) => !o && setReset(null)}
        title={reset ? t("teacher.resetFor", { name: reset.name }) : ""}
        description={t("master.resetPasswordBody")}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setReset(null)}>
            {t("common.cancel")}
          </Button>
          <Button loading={doReset.isPending} onClick={() => reset && doReset.mutate(reset)}>
            {t("master.resetPassword")}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={secret !== null}
        onOpenChange={(o) => !o && setSecret(null)}
        title={t("master.tempPasswordTitle")}
        description={t("master.tempPasswordBody")}
      >
        {secret ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-2">
              {t("master.tempPasswordFor", { name: secret.name })}
            </p>
            <p
              data-testid="temporary-password"
              className="rounded-sm bg-paper px-4 py-3 font-mono text-h2 tracking-wider"
            >
              {secret.password}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setSecret(null)}>{t("common.close2")}</Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <CardsDialog
        classRow={cards && cls.data ? ({ id: cls.data.id, name: cls.data.name } as Row) : null}
        onClose={() => setCards(false)}
      />
    </div>
  );
}
