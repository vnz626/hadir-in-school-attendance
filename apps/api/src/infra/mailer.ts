import { Logger } from "@nestjs/common";

export interface Mail {
  to: string;
  subject: string;
  body: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Implementasi lokal: tidak ada server email. Isi surat ditulis ke log supaya tautan atur ulang
 * kata sandi bisa disalin saat pengembangan. Tautan itu memuat token sekali pakai berumur 30 menit,
 * jadi implementasi ini TIDAK boleh dipakai di luar lokal (Rancangan §9.1).
 */
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger("Mailer");

  async send(mail: Mail): Promise<void> {
    this.logger.log(`Email ke ${mail.to} | ${mail.subject}\n${mail.body}`);
  }
}

/** Untuk tes: menampung surat yang "terkirim". */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];

  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }
}
