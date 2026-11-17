import { Inject, Injectable } from "@nestjs/common";
import crypto from "node:crypto";
import type { Clock } from "@hadirin/domain";
import { APP_CONFIG, type AppConfig } from "../../config/env";
import { CLOCK } from "../../infra/tokens";

export const FILE_URL_TTL_MS = 5 * 60_000;

/**
 * URL bertanda tangan HMAC berumur 5 menit (Rancangan §14.2). Berkas pribadi (kartu masuk, nanti
 * surat izin) tidak pernah disajikan lewat folder publik, hanya lewat token ini.
 */
@Injectable()
export class FileUrlService {
  private readonly key: Buffer;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    // Kunci turunan: pembocoran token berkas tidak membuka kunci token akses.
    this.key = crypto.createHash("sha256").update(`file-url:${config.jwtAccessSecret}`).digest();
  }

  private mac(payload: string): string {
    return crypto.createHmac("sha256", this.key).update(payload).digest("base64url");
  }

  sign(storageKey: string, downloadName: string, ttlMs = FILE_URL_TTL_MS): string {
    const payload = Buffer.from(
      JSON.stringify({ k: storageKey, n: downloadName, e: this.clock.now().getTime() + ttlMs }),
    ).toString("base64url");
    return `${payload}.${this.mac(payload)}`;
  }

  /** `null` bila tanda tangan salah atau sudah kedaluwarsa. Perbandingan waktu konstan. */
  verify(token: string): { key: string; name: string } | null {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = Buffer.from(this.mac(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        k: string;
        n: string;
        e: number;
      };
      if (typeof data.k !== "string" || typeof data.n !== "string" || typeof data.e !== "number")
        return null;
      if (data.e <= this.clock.now().getTime()) return null;
      return { key: data.k, name: data.n };
    } catch {
      return null;
    }
  }
}
