import fs from "node:fs/promises";
import path from "node:path";

/**
 * Penyimpanan berkas di balik antarmuka (Rancangan §9.1). Implementasi lokal memakai folder
 * `storage/` di luar folder yang disajikan Next.js; S3/Cloudinary ditambahkan saat deploy.
 */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_\-./]*$/;

/** Kunci tidak boleh keluar dari folder dasar (path traversal). */
export function assertSafeKey(key: string): void {
  if (!KEY_RE.test(key) || key.split("/").some((p) => p === ".." || p === "." || p === "")) {
    throw new Error(`Kunci berkas tidak valid: ${key}`);
  }
}

export class LocalFileStorage implements FileStorage {
  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.baseDir, key);
    if (!full.startsWith(path.resolve(this.baseDir) + path.sep))
      throw new Error("Kunci berkas keluar dari folder dasar");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    // Tulis ke berkas sementara lalu ganti nama, supaya pembaca tidak pernah melihat berkas setengah jadi.
    const tmp = `${full}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, full);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

/** Untuk tes. */
export class MemoryFileStorage implements FileStorage {
  readonly files = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<void> {
    assertSafeKey(key);
    this.files.set(key, data);
  }

  async get(key: string): Promise<Buffer | null> {
    assertSafeKey(key);
    return this.files.get(key) ?? null;
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    return this.files.has(key);
  }
}
