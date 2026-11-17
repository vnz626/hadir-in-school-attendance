"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthLayout } from "../../components/auth/auth-layout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api, ApiError } from "../../lib/api";
import { t } from "../../lib/i18n";

function ForgotForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/password/forgot", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("auth.forgotTitle")}>
      {sent ? (
        <p role="status" className="text-body text-ink">
          {t("auth.forgotSent")}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
          <p className="text-body text-ink-2">{t("auth.forgotBody")}</p>
          <Input
            label={t("auth.email")}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error ?? undefined}
            required
          />
          <Button type="submit" loading={busy} disabled={!email}>
            {t("auth.sendLink")}
          </Button>
        </form>
      )}
      <Link href="/masuk" className="flex min-h-11 items-center font-semibold text-primary">
        {t("auth.backToLogin")}
      </Link>
    </AuthLayout>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotForm />
    </Suspense>
  );
}
