import type { Request } from "express";

export const ACCESS_COOKIE = "hadirin_at";
export const REFRESH_COOKIE = "hadirin_rt";

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * IP klien. API hanya dijangkau lewat Next.js (loopback), yang menambahkan IP asal di ujung
 * `X-Forwarded-For`. Entri paling kanan itulah yang dipercaya; yang di kiri bisa dipalsukan klien.
 */
export function clientIp(req: Request): string {
  const remote = req.socket.remoteAddress ?? "";
  if (LOOPBACK.has(remote)) {
    const xff = req.headers["x-forwarded-for"];
    const raw = Array.isArray(xff) ? xff.join(",") : xff;
    const last = raw?.split(",").pop()?.trim();
    if (last) return last;
  }
  return remote || "unknown";
}

export function userAgentOf(req: Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 255) : null;
}
