import { Injectable } from "@nestjs/common";
import argon2 from "argon2";
import crypto from "node:crypto";

// Tanpa karakter yang mudah tertukar: 0/O, 1/l/I (Rancangan §14.1).
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_LENGTH = 10;

@Injectable()
export class PasswordService {
  // Hash tiruan untuk akun yang tidak ada, supaya waktu respons tidak membocorkan keberadaan akun.
  private dummyHash: Promise<string> | null = null;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async verifyAgainstDummy(plain: string): Promise<void> {
    this.dummyHash ??= this.hash(crypto.randomBytes(16).toString("hex"));
    await this.verify(await this.dummyHash, plain);
  }

  /** Kata sandi sementara acak, dipakai untuk kartu masuk dan reset oleh wali kelas. */
  generateTemporary(): string {
    let out = "";
    for (let i = 0; i < TEMP_LENGTH; i++)
      out += TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)];
    return out;
  }
}
