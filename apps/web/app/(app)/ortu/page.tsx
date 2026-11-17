"use client";

import { EmptyState } from "../../../components/ui/empty-state";
import { t } from "../../../lib/i18n";

export default function ParentHomePage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-h1">{t("home.parentTitle")}</h1>
      <EmptyState title={t("home.comingTitle")} description={t("empty.parentHome")} />
    </div>
  );
}
