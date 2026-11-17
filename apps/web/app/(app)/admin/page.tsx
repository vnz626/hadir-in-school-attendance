"use client";

import Link from "next/link";
import { EmptyState } from "../../../components/ui/empty-state";
import { t } from "../../../lib/i18n";

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-h1">{t("home.adminTitle")}</h1>
      <EmptyState
        title={t("home.adminStart")}
        description={t("home.adminStartBody")}
        action={
          <Link
            href="/admin/master"
            className="inline-flex h-11 items-center rounded-sm bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-press lg:h-10"
          >
            {t("master.title")}
          </Link>
        }
      />
    </div>
  );
}
