"use client";

import Link from "next/link";
import { Button } from "../../../../components/ui/button";
import { useAuth } from "../../../../lib/auth";
import { t, td } from "../../../../lib/i18n";

export default function StudentAccountPage() {
  const { user, logout } = useAuth();
  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="text-h1">{t("home.accountTitle")}</h1>
      <p className="text-body">
        {user?.name} <span className="text-ink-2">({user ? td(`roles.${user.role}`) : ""})</span>
      </p>
      <Link
        href="/ganti-kata-sandi"
        className="inline-flex h-11 items-center justify-center rounded-sm border border-line-strong px-4 text-sm font-semibold hover:bg-primary-tint"
      >
        {t("auth.changeTitle")}
      </Link>
      <Button variant="ghost" onClick={() => void logout()}>
        {t("auth.logout")}
      </Button>
    </div>
  );
}
