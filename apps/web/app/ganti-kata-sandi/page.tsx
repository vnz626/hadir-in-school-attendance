"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LoginResponse } from "@hadirin/shared";
import { AuthLayout } from "../../components/auth/auth-layout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useToast } from "../../components/ui/toast";
import { api, ApiError } from "../../lib/api";
import { ME_KEY, homeFor, useAuth } from "../../lib/auth";
import { t } from "../../lib/i18n";

/** Wajib setelah masuk dengan kata sandi awal (Rancangan §6.1); juga bisa dibuka sukarela dari akun. */
export default function ChangePasswordPage() {
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const { user, loading, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/masuk");
  }, [loading, user, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const res = await api<LoginResponse>("/auth/password/change", {
        method: "POST",
        body: { currentPassword: current, newPassword: next },
      });
      client.setQueryData(ME_KEY, res.user);
      toast.show(t("auth.changeDone"));
      router.replace(homeFor(res.user.role));
    } catch (err) {
      if (err instanceof ApiError)
        setErrors(Object.keys(err.fieldErrors).length ? err.fieldErrors : { form: err.message });
      else setErrors({ form: t("common.genericError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("auth.changeTitle")}>
      <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
        <p className="text-body text-ink-2">{t("auth.changeBody")}</p>
        <Input
          label={t("auth.currentPassword")}
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.currentPassword}
          required
        />
        <Input
          label={t("auth.newPassword")}
          type="password"
          name="newPassword"
          autoComplete="new-password"
          hint={t("auth.passwordHint")}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={errors.newPassword}
          required
        />
        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-status-absent-fg">
          {errors.form}
        </p>
        <Button type="submit" loading={busy} disabled={!current || next.length < 8}>
          {t("auth.changeSubmit")}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => void logout()}
        className="min-h-11 self-start font-semibold text-primary"
      >
        {t("auth.logout")}
      </button>
    </AuthLayout>
  );
}
