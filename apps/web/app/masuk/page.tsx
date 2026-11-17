"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import type { LoginResponse } from "@hadirin/shared";
import { AuthLayout } from "../../components/auth/auth-layout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api, ApiError } from "../../lib/api";
import { ME_KEY, homeFor } from "../../lib/auth";
import { getDeviceId } from "../../lib/device";
import { t } from "../../lib/i18n";

/** iOS di Safari biasa (bukan PWA terpasang): penyimpanan terpisah, jadi arahkan memasang dulu (Rancangan §6.1, §12.3). */
function useIosHint(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua);
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setShow(ios && !standalone);
  }, []);
  return show;
}

export default function LoginPage() {
  const router = useRouter();
  const client = useQueryClient();
  const iosHint = useIosHint();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Identitas perangkat hanya untuk siswa (login dengan NIS, bukan email).
      const deviceId = identifier.includes("@") ? undefined : await getDeviceId();
      const res = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: { identifier, password, deviceId },
      });
      client.setQueryData(ME_KEY, res.user);
      router.replace(res.user.mustChangePassword ? "/ganti-kata-sandi" : homeFor(res.user.role));
    } catch (err) {
      if (err instanceof ApiError)
        setError(err.code === "RATE_LIMITED" ? t("auth.rateLimited") : err.message);
      else setError(t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("auth.title")}>
      {iosHint ? (
        <p role="note" className="rounded-sm bg-live-tint px-3 py-2 text-sm text-ink">
          {t("auth.iosHint")}
        </p>
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
        <Input
          label={t("auth.identifier")}
          name="identifier"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <Input
          label={t("auth.password")}
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          trailing={
            <button
              type="button"
              aria-label={showPassword ? t("common.hidePassword") : t("common.showPassword")}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((s) => !s)}
              className="flex size-11 items-center justify-center rounded-sm text-ink-2 hover:bg-primary-tint"
            >
              {showPassword ? (
                <EyeOff aria-hidden className="size-5" strokeWidth={1.75} />
              ) : (
                <Eye aria-hidden className="size-5" strokeWidth={1.75} />
              )}
            </button>
          }
        />
        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-status-absent-fg">
          {error}
        </p>
        <Button type="submit" loading={busy} disabled={!identifier || !password}>
          {t("auth.submit")}
        </Button>
      </form>

      <div className="flex flex-col gap-2 text-sm">
        <button
          type="button"
          aria-expanded={forgot}
          onClick={() => setForgot((f) => !f)}
          className="min-h-11 self-start font-semibold text-primary"
        >
          {t("auth.forgot")}
        </button>
        {forgot ? (
          <div className="flex flex-col gap-2 rounded-sm bg-paper p-3 text-ink-2">
            <p>{t("auth.forgotHelpStudent")}</p>
            <p>
              {t("auth.forgotHelpStaff")}{" "}
              <Link
                className="font-semibold text-primary underline"
                href={`/lupa-kata-sandi${identifier.includes("@") ? `?email=${encodeURIComponent(identifier)}` : ""}`}
              >
                {t("auth.forgotLink")}
              </Link>
              .
            </p>
          </div>
        ) : null}
      </div>
    </AuthLayout>
  );
}
