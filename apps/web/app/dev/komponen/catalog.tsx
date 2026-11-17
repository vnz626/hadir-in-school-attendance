"use client";

import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { baseColors, contrastRatio, statusColors } from "@hadirin/ui-tokens";
import { AttendanceStrip, type StripDay } from "../../../components/domain/attendance-strip";
import { Button, type ButtonVariant } from "../../../components/ui/button";
import {
  DataTable,
  type Column,
  type SortState,
  type TableState,
} from "../../../components/ui/data-table";
import { Dialog } from "../../../components/ui/dialog";
import { EmptyState } from "../../../components/ui/empty-state";
import { Input } from "../../../components/ui/input";
import { Skeleton, SkeletonRows } from "../../../components/ui/skeleton";
import { ErrorState, ForbiddenState } from "../../../components/ui/state-panels";
import { StatusPill } from "../../../components/ui/status-pill";
import { useToast } from "../../../components/ui/toast";
import { t } from "../../../lib/i18n";
import type { StatusKey } from "../../../lib/status";

const STATUS_KEYS: StatusKey[] = [
  "present",
  "late",
  "excused",
  "sick",
  "dispensed",
  "absent",
  "none",
  "holiday",
];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line py-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2">{title}</h2>
        {note ? <p className="max-w-[70ch] text-sm text-ink-2">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

interface Row {
  id: string;
  name: string;
  className: string;
  present: number;
}

const ROWS: Row[] = Array.from({ length: 150 }, (_, i) => ({
  id: `r${i}`,
  name: `Siswa contoh ${i + 1}`,
  className: i % 2 === 0 ? "7A" : "7B",
  present: 40 + (i % 20),
}));

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Nama", cell: (r) => r.name, sortable: true },
  { key: "className", header: "Kelas", cell: (r) => r.className, sortable: true },
  { key: "present", header: "Hari hadir", cell: (r) => r.present, numeric: true, sortable: true },
];

const STRIP_DAYS: StripDay[] = Array.from({ length: 30 }, (_, i) => {
  const cycle: StatusKey[] = [
    "present",
    "present",
    "present",
    "late",
    "present",
    "excused",
    "present",
    "present",
    "sick",
    "present",
    "dispensed",
    "absent",
    "none",
    "holiday",
  ];
  return { date: `2026-10-${String(i + 1).padStart(2, "0")}`, status: cycle[i % cycle.length]! };
});

export function Catalog() {
  const toast = useToast();
  const [dialog, setDialog] = useState<"dialog" | "side" | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [tableState, setTableState] = useState<TableState>("ready");
  const [sort, setSort] = useState<SortState>({ key: "name", direction: "asc" });
  const [showEmpty, setShowEmpty] = useState(false);

  const sorted = [...ROWS].sort((a, b) => {
    const key = sort.key as keyof Row;
    const cmp = String(a[key]).localeCompare(String(b[key]), "id", { numeric: true });
    return sort.direction === "asc" ? cmp : -cmp;
  });

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col px-4 py-8">
      <header className="flex flex-col gap-2 pb-8">
        <p className="text-h3">
          hadir<span className="text-live">.</span>
        </p>
        <h1 className="text-h1">Katalog komponen</h1>
        <p className="max-w-[70ch] text-body text-ink-2">
          Halaman internal untuk meninjau setiap komponen dalam semua state. Hanya aktif di lokal.
          Hover dan fokus juga bisa dicoba langsung: arahkan kursor atau tekan Tab.
        </p>
      </header>

      <Section
        title="Warna"
        note="Kuning pensil hanya untuk hal yang sedang berlangsung (sesi aktif dan QR). Tidak ada status kehadiran yang berwarna kuning."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Object.keys(baseColors).map((k) => {
            const cssName = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
            return (
              <div key={k} className="flex flex-col gap-1 text-caption">
                <div
                  className="h-12 rounded-sm border border-line"
                  style={{ background: `var(--c-${cssName})` }}
                />
                <span className="font-semibold">{cssName}</span>
                <span className="text-ink-2">{baseColors[k as keyof typeof baseColors]}</span>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(statusColors) as Array<keyof typeof statusColors>).map((k) => (
            <div key={k} className="flex flex-col gap-1 text-caption">
              <div className="h-12 rounded-sm" style={{ background: `var(--s-${k})` }} />
              <span className="font-semibold">
                {statusColors[k].code} · {statusColors[k].label}
              </span>
              <span className="text-ink-2">
                {contrastRatio(statusColors[k].solid, baseColors.surface).toFixed(2)}:1 pada putih
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografi" note="Plus Jakarta Sans, bobot 400 sampai 800. Angka tabular.">
        <div className="flex flex-col gap-2">
          <p className="text-display">07:30</p>
          <p className="text-h1">Judul halaman</p>
          <p className="text-h2">Judul bagian</p>
          <p className="text-h3">Judul panel</p>
          <p className="text-body">Teks isi 16 piksel untuk bacaan panjang dan input mobile.</p>
          <p className="text-sm">Teks tabel dan form, 14 piksel medium. 1.234 · 22 · 8</p>
          <p className="text-caption text-ink-2">Keterangan tambahan, 12 piksel.</p>
        </div>
      </Section>

      <Section
        title="Button"
        note="Varian × state. Tinggi 44 di mobile, 40 di desktop. Label kata kerja, tanpa panah."
      >
        <div className="flex flex-col gap-3">
          {(["primary", "secondary", "ghost", "danger"] as ButtonVariant[]).map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-caption text-ink-2">{v}</span>
              <Button variant={v}>Default</Button>
              <Button variant={v} forceState="hover">
                Hover
              </Button>
              <Button variant={v} forceState="pressed">
                Pressed
              </Button>
              <Button variant={v} disabled>
                Disabled
              </Button>
              <Button variant={v} loading>
                Loading
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Input" note="Label di atas, galat di bawah dan diumumkan lewat aria-live.">
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Default" placeholder="Contoh: Budi Santoso" />
          <Input label="Hover" placeholder="Tepi menebal" forceState="hover" />
          <Input label="Dengan petunjuk" hint="Gunakan NIS 10 digit." placeholder="2026000001" />
          <Input label="Galat" defaultValue="abc" error="NIS harus berupa angka 10 digit." />
          <Input label="Disabled" disabled defaultValue="Tidak bisa diubah" />
          <Input
            label="Kata sandi"
            type={showPw ? "text" : "password"}
            defaultValue="rahasia123"
            trailing={
              <button
                type="button"
                aria-label={showPw ? t("common.hidePassword") : t("common.showPassword")}
                className="flex size-11 items-center justify-center rounded-sm text-ink-2 hover:bg-primary-tint"
                onClick={() => setShowPw((s) => !s)}
              >
                {showPw ? (
                  <EyeOff aria-hidden className="size-5" strokeWidth={1.75} />
                ) : (
                  <Eye aria-hidden className="size-5" strokeWidth={1.75} />
                )}
              </button>
            }
          />
        </div>
      </Section>

      <Section
        title="StatusPill"
        note="Ikon bentuk + label; kode huruf bila diminta. Tidak pernah hanya warna."
      >
        <div className="flex flex-wrap gap-3">
          {STATUS_KEYS.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {STATUS_KEYS.map((s) => (
            <StatusPill key={s} status={s} showCode />
          ))}
        </div>
      </Section>

      <Section
        title="AttendanceStrip"
        note="Satu segmen per hari sekolah. Hari libur berupa garis putus; belum absen berupa kotak kosong bertepi tegas."
      >
        <div className="flex flex-col gap-4 rounded-md border border-line bg-surface p-4">
          <AttendanceStrip days={STRIP_DAYS} />
          <AttendanceStrip days={STRIP_DAYS.slice(0, 20)} size="lg" />
          <AttendanceStrip days={[]} />
        </div>
      </Section>

      <Section
        title="DataTable"
        note="Header lengket, kolom pertama lengket, urut, virtual scroll di atas 100 baris (150 baris di bawah). Di layar sempit menjadi daftar baris."
      >
        <div className="flex flex-wrap gap-2">
          {(["ready", "loading", "error"] as TableState[]).map((s) => (
            <Button
              key={s}
              variant={tableState === s && !showEmpty ? "primary" : "secondary"}
              onClick={() => {
                setTableState(s);
                setShowEmpty(false);
              }}
            >
              {s}
            </Button>
          ))}
          <Button variant={showEmpty ? "primary" : "secondary"} onClick={() => setShowEmpty(true)}>
            empty
          </Button>
        </div>
        <DataTable
          caption="Contoh daftar siswa"
          columns={COLUMNS}
          rows={showEmpty ? [] : sorted}
          getRowId={(r) => r.id}
          state={tableState}
          sort={sort}
          onSortChange={setSort}
          onRetry={() => setTableState("ready")}
          partialNotice={
            tableState === "ready" && !showEmpty
              ? "Sebagian data belum tampil: daftar kelas 8 gagal dimuat."
              : undefined
          }
          emptyAction={<Button variant="secondary">{t("common.add")}</Button>}
        />
      </Section>

      <Section
        title="Dialog, bottom sheet, dan toast"
        note="Di bawah 768 px dialog berubah menjadi bottom sheet. Fokus terkunci, Esc menutup."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDialog("dialog")}>
            Buka dialog
          </Button>
          <Button variant="secondary" onClick={() => setDialog("side")}>
            Buka panel samping
          </Button>
          <Button variant="secondary" onClick={() => toast.show(t("common.saved"))}>
            Toast sederhana
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.show("32 siswa ditandai hadir. Ketuk nama untuk mengubah.", {
                onUndo: () => toast.show("Dibatalkan"),
              })
            }
          >
            Toast dengan batalkan
          </Button>
        </div>
        <Dialog
          open={dialog === "dialog"}
          onOpenChange={(o) => !o && setDialog(null)}
          title="Tutup sesi?"
          description="Siswa yang belum absen akan ditandai alpa."
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={() => setDialog(null)}>
              Tutup sesi
            </Button>
          </div>
        </Dialog>
        <Dialog
          variant="side"
          open={dialog === "side"}
          onOpenChange={(o) => !o && setDialog(null)}
          title="Ubah kelas"
          description="Formulir data master tampil di panel samping."
        >
          <Input label="Nama kelas" defaultValue="7A" />
          <Button onClick={() => setDialog(null)}>{t("common.save")}</Button>
        </Dialog>
      </Section>

      <Section title="Lima keadaan layar" note="Memuat, kosong, galat, sebagian, dan tanpa akses.">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-caption text-ink-2">Memuat</p>
            <SkeletonRows rows={3} />
            <Skeleton className="h-6 w-1/2" />
          </div>
          <div>
            <p className="text-caption text-ink-2">Kosong</p>
            <EmptyState
              title="Tidak ada pengajuan yang menunggu."
              description="Pengajuan dari orang tua dan guru akan muncul di sini."
            />
          </div>
          <div>
            <p className="text-caption text-ink-2">Galat</p>
            <ErrorState onRetry={() => toast.show(t("common.retry"))} />
          </div>
          <div>
            <p className="text-caption text-ink-2">Tanpa akses</p>
            <ForbiddenState />
          </div>
        </div>
      </Section>
    </main>
  );
}
