import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { APP_CONFIG, type AppConfig } from "../config/env";
import { forbidden } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Perlindungan CSRF untuk endpoint berbasis cookie (Rancangan §14.2), tanpa token tambahan:
 *  1. `Sec-Fetch-Site` (diisi browser, tidak bisa dipalsukan skrip halaman): tolak `cross-site`
 *     dan `same-site` yang bukan asal sendiri.
 *  2. Bila tidak ada, `Origin` harus termasuk APP_ORIGIN atau sama dengan host yang diteruskan
 *     Next.js (`X-Forwarded-Host`), sehingga alamat tunnel yang berubah tetap bekerja.
 * Permintaan tanpa kedua header (klien non-browser, tes) lolos karena tidak membawa cookie browser.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const site = req.headers["sec-fetch-site"];
    if (typeof site === "string") {
      if (site === "same-origin" || site === "none") return true;
      throw forbidden("Permintaan ditolak karena berasal dari situs lain.");
    }

    const origin = req.headers.origin;
    if (typeof origin !== "string") return true;
    if (this.config.appOrigins.includes(origin.replace(/\/$/, ""))) return true;

    const fwdHost = req.headers["x-forwarded-host"];
    const host = typeof fwdHost === "string" ? fwdHost.split(",")[0]!.trim() : req.headers.host;
    try {
      if (host && new URL(origin).host === host) return true;
    } catch {
      // Origin bukan URL yang valid: tolak di bawah.
    }
    throw forbidden("Permintaan ditolak karena berasal dari situs lain.");
  }
}
