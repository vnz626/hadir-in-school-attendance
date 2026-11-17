"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { td, t } from "../../lib/i18n";
import { buildResources, type Row } from "../../lib/resources";
import { Button } from "../ui/button";
import { DataTable, type Column, type SortState } from "../ui/data-table";
import { Dialog } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { useToast } from "../ui/toast";
import { CardsDialog } from "./cards-dialog";
import { RefPicker } from "./ref-picker";
import { ResourceForm } from "./resource-form";

interface PageResponse {
  data: Row[];
  page: number;
  pageSize: number;
  total: number;
}

const PAGE_SIZE = 25;

type Panel = { mode: "create" } | { mode: "edit"; row: Row } | null;
type Confirm = { kind: "remove" | "reset"; row: Row } | null;

export function ResourcePage({ resourceKey }: { resourceKey: string }) {
  const def = useMemo(() => buildResources()[resourceKey], [resourceKey]);
  const client = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({
    key: def?.defaultSort ?? "name",
    direction: "asc",
  });
  const [archived, setArchived] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState<{ name: string; password: string } | null>(null);
  const [moveRow, setMoveRow] = useState<Row | null>(null);
  const [cardsClass, setCardsClass] = useState<Row | null>(null);

  useEffect(() => {
    const h = setTimeout(() => {
      setSearch(term);
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [term]);

  const listKey = ["master", def?.path, page, search, sort.key, sort.direction, archived] as const;
  const list = useQuery({
    queryKey: listKey,
    enabled: Boolean(def),
    queryFn: () =>
      api<PageResponse>(def!.path, {
        query: {
          page,
          pageSize: PAGE_SIZE,
          q: search,
          sort: sort.key,
          order: sort.direction,
          includeArchived: archived || undefined,
        },
      }),
  });

  const refresh = () => client.invalidateQueries({ queryKey: ["master", def?.path] });

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!def) throw new Error("tidak ada definisi");
      if (panel?.mode === "edit")
        return api<unknown>(`${def.path}/${panel.row.id}`, { method: "PATCH", body: payload });
      return api<unknown>(def.path, { method: "POST", body: payload });
    },
    onSuccess: (res) => {
      const creating = panel?.mode === "create";
      setPanel(null);
      setFormErrors({});
      toast.show(creating ? t("master.created") : t("master.saved"));
      void refresh();
      // Pembuatan siswa/guru mengembalikan kata sandi sementara SEKALI: tampilkan, jangan simpan.
      const tp = def?.temporaryPassword;
      if (creating && tp) {
        const body = res as Record<string, Record<string, unknown> | string>;
        const entity = body[tp.wrapper] as Record<string, unknown>;
        setSecret({ name: String(entity[tp.nameField]), password: String(body.temporaryPassword) });
      }
    },
    onError: (e) => {
      if (e instanceof ApiError)
        setFormErrors(Object.keys(e.fieldErrors).length ? e.fieldErrors : { form: e.message });
      else setFormErrors({ form: t("common.genericError") });
    },
  });

  const remove = useMutation({
    mutationFn: (row: Row) => api(`${def!.path}/${row.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.show(def?.removal === "archive" ? t("master.archived") : t("master.deleted"));
      setConfirm(null);
      void refresh();
    },
    onError: (e) => {
      setConfirm(null);
      toast.show(e instanceof ApiError ? e.message : t("common.genericError"));
    },
  });

  const resetPassword = useMutation({
    mutationFn: (row: Row) =>
      api<{ temporaryPassword: string }>(`/students/${row.id}/password-reset`, { method: "POST" }),
    onSuccess: (res, row) => {
      setConfirm(null);
      setSecret({ name: String(row.name), password: res.temporaryPassword });
    },
    onError: (e) => {
      setConfirm(null);
      toast.show(e instanceof ApiError ? e.message : t("common.genericError"));
    },
  });

  if (!def)
    return <EmptyState title={t("state.errorTitle")} description={t("state.forbiddenBody")} />;

  const singular = td(`resources.${def.key}.singular`);
  const removeLabel = def.removal === "archive" ? t("common.archive") : t("common.delete");

  const columns: Column<Row>[] = [
    ...def.columns.map((c) => ({
      key: c.sortKey ?? c.key,
      header: c.header,
      cell: (r: Row) => c.cell(r),
      numeric: c.numeric,
      sortable: Boolean(c.sortKey),
      sticky: false,
    })),
    {
      key: "_actions",
      header: t("common.actions"),
      mobileFull: true,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-x-1">
          <RowButton
            onClick={() => {
              setFormErrors({});
              setPanel({ mode: "edit", row: r });
            }}
          >
            {t("common.edit")}
          </RowButton>
          {def.actions?.includes("moveClass") ? (
            <RowButton onClick={() => setMoveRow(r)}>{t("master.moveClass")}</RowButton>
          ) : null}
          {def.actions?.includes("resetPassword") ? (
            <RowButton onClick={() => setConfirm({ kind: "reset", row: r })}>
              {t("master.resetPassword")}
            </RowButton>
          ) : null}
          {def.actions?.includes("credentialCards") ? (
            <RowButton onClick={() => setCardsClass(r)}>{t("master.credentialCards")}</RowButton>
          ) : null}
          {r.archived ? (
            <span className="px-2 text-caption text-ink-2">{t("master.archivedBadge")}</span>
          ) : (
            <RowButton danger onClick={() => setConfirm({ kind: "remove", row: r })}>
              {removeLabel}
            </RowButton>
          )}
        </span>
      ),
    },
  ];

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">{td(`resources.${def.key}.title`)}</h1>
        <p className="max-w-[70ch] text-body text-ink-2">
          {td(`resources.${def.key}.description`)}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
          <Input
            label={t("common.search")}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("common.searchPlaceholder")}
          />
        </div>
        {def.removal === "archive" ? (
          <label className="flex min-h-11 items-center gap-2 pb-5 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={archived}
              onChange={(e) => {
                setArchived(e.target.checked);
                setPage(1);
              }}
            />
            {t("master.showArchived")}
          </label>
        ) : null}
        <div className="pb-5 sm:ml-auto">
          <Button
            onClick={() => {
              setFormErrors({});
              setPanel({ mode: "create" });
            }}
          >
            <Plus aria-hidden className="size-4" strokeWidth={2} />
            {t("master.newItem", { name: singular })}
          </Button>
        </div>
      </div>

      <DataTable
        caption={td(`resources.${def.key}.title`)}
        columns={columns}
        rows={list.data?.data ?? []}
        getRowId={(r) => r.id}
        state={list.isLoading ? "loading" : list.isError ? "error" : "ready"}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        onRetry={() => void list.refetch()}
        emptyTitle={search ? t("state.emptyTitle") : t("master.title")}
        emptyDescription={search ? t("table.empty") : t("master.empty")}
        emptyAction={
          search ? undefined : (
            <Button
              variant="secondary"
              onClick={() => {
                setFormErrors({});
                setPanel({ mode: "create" });
              }}
            >
              {t("master.newItem", { name: singular })}
            </Button>
          )
        }
      />

      {total > 0 ? (
        <nav
          aria-label={t("common.pageOf", { page, pages })}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="text-ink-2">{t("common.total", { count: total })}</span>
          <span className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("common.previous")}
            </Button>
            <span aria-live="polite">{t("common.pageOf", { page, pages })}</span>
            <Button
              variant="secondary"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("common.next")}
            </Button>
          </span>
        </nav>
      ) : null}

      {/* Formulir tambah/ubah di panel samping (bottom sheet di mobile). */}
      <Dialog
        variant="side"
        open={panel !== null}
        onOpenChange={(o) => !o && setPanel(null)}
        title={
          panel?.mode === "edit"
            ? t("master.editItem", { name: singular })
            : t("master.newItem", { name: singular })
        }
      >
        {panel ? (
          <ResourceForm
            key={panel.mode === "edit" ? panel.row.id : "new"}
            def={def}
            row={panel.mode === "edit" ? panel.row : null}
            busy={save.isPending}
            errors={formErrors}
            onSubmit={(payload) => save.mutate(payload)}
            onCancel={() => setPanel(null)}
          />
        ) : null}
      </Dialog>

      {/* Konfirmasi arsip/hapus dan atur ulang kata sandi. */}
      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.kind === "reset"
            ? t("teacher.resetFor", { name: String(confirm.row.name) })
            : def.removal === "archive"
              ? t("master.archiveTitle")
              : t("master.deleteTitle")
        }
        description={
          confirm?.kind === "reset"
            ? t("master.resetPasswordBody")
            : def.removal === "archive"
              ? t("master.archiveBody")
              : t("master.deleteBody")
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={confirm?.kind === "reset" ? "primary" : "danger"}
            loading={remove.isPending || resetPassword.isPending}
            onClick={() => {
              if (!confirm) return;
              if (confirm.kind === "reset") resetPassword.mutate(confirm.row);
              else remove.mutate(confirm.row);
            }}
          >
            {confirm?.kind === "reset" ? t("master.resetPassword") : removeLabel}
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
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(secret.password);
                  toast.show(t("common.copied"));
                }}
              >
                {t("common.copy")}
              </Button>
              <Button onClick={() => setSecret(null)}>{t("common.close2")}</Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <MoveClassDialog
        row={moveRow}
        onClose={() => setMoveRow(null)}
        onDone={() => {
          setMoveRow(null);
          toast.show(t("master.moveDone"));
          void refresh();
        }}
      />
      <CardsDialog classRow={cardsClass} onClose={() => setCardsClass(null)} />
    </div>
  );
}

function RowButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-sm px-2 text-sm font-semibold hover:bg-primary-tint ${danger ? "text-status-absent-fg" : "text-primary"}`}
    >
      {children}
    </button>
  );
}

function MoveClassDialog({
  row,
  onClose,
  onDone,
}: {
  row: Row | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [classId, setClassId] = useState<string | null>(null);
  const [classLabel, setClassLabel] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | undefined>();

  const move = useMutation({
    mutationFn: () =>
      api(`/students/${row!.id}/enrollments`, {
        method: "POST",
        body: { classId, startDate: date },
      }),
    onSuccess: () => {
      setClassId(null);
      setClassLabel(null);
      setDate("");
      setError(undefined);
      onDone();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t("common.genericError")),
  });

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t("master.moveClass")}
      description={row ? String(row.name) : undefined}
    >
      <div className="flex flex-col gap-3">
        <RefPicker
          source="classes"
          label={td("resources.students.fields.classId")}
          required
          value={classId}
          valueLabel={classLabel}
          onChange={(id, l) => {
            setClassId(id);
            setClassLabel(l);
          }}
        />
        <Input
          label={t("master.moveDate")}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={error}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            loading={move.isPending}
            disabled={!classId || !date}
            onClick={() => move.mutate()}
          >
            {t("master.moveClass")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
