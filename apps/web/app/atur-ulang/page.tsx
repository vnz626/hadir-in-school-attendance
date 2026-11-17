"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthLayout } from "../../components/auth/auth-layout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api, ApiError } from "../../lib/api";
import { t } from "../../lib/i18n";

function ResetForm() {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      await api("/auth/password/reset", { method: "POST", body: { token, newPassword: password } });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.fieldErrors.newPassword ?? err.message)
          : t("common.genericError"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("auth.resetTitle")}>
      {!token ? (
        <p role="alert" className="text-body text-status-absent-fg">
          {t("auth.resetMissingToken")}
        </p>
      ) : done ? (
        <p role="status" className="text-body">
          {t("auth.resetDone")}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
          <p className="text-body text-ink-2">{t("auth.resetBody")}</p>
          <Input
            label={t("auth.newPassword")}
            type="password"
            name="newPassword"
            autoComplete="new-password"
            hint={t("auth.passwordHint")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error ?? undefined}
            required
          />
          <Button type="submit" loading={busy} disabled={password.length < 8}>
            {t("auth.resetSubmit")}
          </Button>
        </form>
      )}
      <Link href="/masuk" className="flex min-h-11 items-center font-semibold text-primary">
        {t("auth.backToLogin")}
      </Link>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
