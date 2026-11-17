"use client";

import { EmptyState } from "../../../components/ui/empty-state";
import { t } from "../../../lib/i18n";

export default function StudentHomePage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-h1">{t("home.studentTitle")}</h1>
      <EmptyState title={t("home.comingTitle")} description={t("empty.studentHome")} />
    </div>
  );
}
