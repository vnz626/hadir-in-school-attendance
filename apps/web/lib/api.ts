import { t } from "./i18n";

/** Galat API dalam format seragam `{ error: { code, message, details } }` (Rancangan §11.3). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Galat per kolom dari `details.issues`, untuk ditampilkan di bawah input yang bersangkutan. */
  get fieldErrors(): Record<string, string> {
    const issues =
      (this.details?.issues as Array<{ path: string; message: string }> | undefined) ?? [];
    const out: Record<string, string> = {};
    for (const i of issues) out[i.path.replace(/^(settings|school)\./, "")] ??= i.message;
    return out;
  }
}

let refreshing: Promise<boolean> | null = null;

/** Hanya satu refresh sekaligus: token refresh dirotasi, jadi dua refresh serentak akan dianggap pemakaian ulang. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  form?: FormData;
}

async function request(path: string, opts: Options, retried: boolean): Promise<Response> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${withQuery(path, opts.query)}`, {
      method: opts.method ?? "GET",
      headers,
      body,
    });
  } catch {
    throw new ApiError(0, "NETWORK", t("common.networkError"));
  }
  // Token akses habis (15 menit): pulihkan sesi sekali, lalu ulangi.
  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    if (await refreshSession()) return request(path, opts, true);
  }
  return res;
}

/** Pemanggil API tunggal untuk web. Cookie httpOnly dikirim otomatis (satu origin lewat rewrites). */
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const res = await request(path, opts, false);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json: unknown = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const err = (
      json as
        | { error?: { code?: string; message?: string; details?: Record<string, unknown> } }
        | undefined
    )?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? t("common.genericError"),
      err?.details,
    );
  }
  return json as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
