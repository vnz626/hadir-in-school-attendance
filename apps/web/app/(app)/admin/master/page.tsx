"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { RESOURCE_ORDER } from "../../../../lib/resources";
import { td, t } from "../../../../lib/i18n";

/** Indeks data master: baris berpembatas tipis (bukan kartu), urut sesuai penyiapan sekolah. */
export default function MasterIndexPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">{t("master.title")}</h1>
        <p className="max-w-[70ch] text-body text-ink-2">{t("master.intro")}</p>
      </header>
      <ol className="border-y border-line bg-surface">
        {RESOURCE_ORDER.map((key, i) => (
          <li key={key} className="border-b border-line last:border-b-0">
            <Link
              href={`/admin/master/${key}`}
              className="flex min-h-14 items-center gap-4 px-4 py-3 hover:bg-primary-tint"
            >
              <span className="w-6 text-right text-sm tabular-nums text-ink-3">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-semibold">{td(`resources.${key}.title`)}</span>
                <span className="text-sm text-ink-2">{td(`resources.${key}.description`)}</span>
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold text-primary">
                {t("master.open")}
                <ChevronRight aria-hidden className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
