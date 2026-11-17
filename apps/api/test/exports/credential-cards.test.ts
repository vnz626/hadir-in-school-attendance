import argon2 from "argon2";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSWORDS, agentFor, createTestApp, login, type TestApp } from "../helpers/app";
import { D, prisma, unique } from "../helpers/db";
import { makeSchoolWorld, type SchoolWorld } from "../helpers/school";
import { LocalFileStorage, assertSafeKey } from "../../src/infra/file-storage";
import { FILE_URL_TTL_MS, FileUrlService } from "../../src/modules/exports/file-url.service";
import {
  CredentialCardsHandler,
  renderCredentialCardsPdf,
  type CardData,
} from "../../src/modules/exports/credential-cards";

type Agent = Awaited<ReturnType<typeof agentFor>>;

let t: TestApp;
let w: SchoolWorld;
let other: SchoolWorld;
let admin: Agent;
let adminOther: Agent;
let homeroomA: Agent;
let homeroomB: Agent;
let subjectTeacherA: Agent;
let studentA: Agent;

async function addStudent(classId: string, mustChange: boolean, name: string): Promise<string> {
  const nis = `K${unique()}`.slice(0, 26);
  const hash = await argon2.hash("lama-lama-1", { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      schoolId: w.schoolId,
      role: "STUDENT",
      name,
      loginId: nis,
      passwordHash: hash,
      mustChangePassword: mustChange,
    },
  });
  const s = await prisma.student.create({ data: { userId: user.id, nis } });
  await prisma.classEnrollment.create({
    data: {
      studentId: s.id,
      classId,
      academicYearId: w.yearId,
      startDate: D(w.today),
      openEnrollmentKey: `${s.id}|${w.yearId}`,
    },
  });
  return s.id;
}

beforeAll(async () => {
  t = await createTestApp();
  w = await makeSchoolWorld();
  other = await makeSchoolWorld();
  admin = await agentFor(t, w.admin.email!, PASSWORDS.teacher);
  adminOther = await agentFor(t, other.admin.email!, PASSWORDS.teacher);
  homeroomA = await agentFor(t, w.homeroomA.email!, PASSWORDS.teacher);
  homeroomB = await agentFor(t, w.homeroomB.email!, PASSWORDS.teacher);
  subjectTeacherA = await agentFor(t, w.subjectTeacherA.email!, PASSWORDS.teacher);
  studentA = await agentFor(t, w.studentA.nis, PASSWORDS.teacher);
  await addStudent(w.classA.id, true, "Ani Pending");
  await addStudent(w.classA.id, true, "Budi Pending");
  await addStudent(w.classA.id, true, "Citra Pending");
  await addStudent(w.classA.id, false, "Dedi Sudah Ganti");
});

afterAll(async () => {
  await t.close();
});

async function download(url: string) {
  return t
    .http()
    .get(url)
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
}

describe("POST /classes/:id/credential-cards: akses negatif", () => {
  it("tanpa login 401; siswa, guru mapel, dan wali kelas kelas lain 403", async () => {
    expect((await t.http().post(`/api/classes/${w.classA.id}/credential-cards`)).status).toBe(401);
    for (const [name, agent] of [
      ["siswa", studentA],
      ["guru mapel", subjectTeacherA],
      ["wali kelas B", homeroomB],
    ] as const) {
      const res = await agent.post(`/api/classes/${w.classA.id}/credential-cards`);
      expect(res.status, name).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    // Tidak ada job yang dibuat oleh permintaan yang ditolak.
    expect(
      await prisma.job.count({
        where: { queue: "EXPORT", payload: { path: "$.classId", equals: w.classA.id } },
      }),
    ).toBe(0);
  });

  it("admin sekolah lain: 404; kelas yang diarsipkan atau tidak ada: 404; ID tidak valid: 400", async () => {
    expect((await adminOther.post(`/api/classes/${w.classA.id}/credential-cards`)).status).toBe(
      404,
    );
    expect(
      (await admin.post("/api/classes/0192f0a0-0000-7000-8000-000000000000/credential-cards"))
        .status,
    ).toBe(404);
    expect((await admin.post("/api/classes/bukan-uuid/credential-cards")).status).toBe(400);
    const archived = await prisma.class.create({
      data: {
        academicYearId: w.yearId,
        name: `Arsip-${unique()}`.slice(0, 40),
        grade: 7,
        deletedAt: new Date(),
      },
    });
    expect((await admin.post(`/api/classes/${archived.id}/credential-cards`)).status).toBe(404);
  });
});

describe("alur kartu masuk", () => {
  it("wali kelas meminta, worker memproses, PDF diunduh lewat URL bertanda tangan tanpa cookie", async () => {
    const before = t.printedCards.length;
    const req = await homeroomA.post(`/api/classes/${w.classA.id}/credential-cards`);
    expect(req.status).toBe(202);
    expect(req.headers["cache-control"]).toMatch(/no-store/);
    const exportId: string = req.body.exportId;

    const pending = await homeroomA.get(`/api/exports/${exportId}`);
    expect(pending.body).toMatchObject({ status: "PENDING", downloadUrl: null });

    expect(await t.runner.drain()).toBeGreaterThanOrEqual(1);
    const done = await homeroomA.get(`/api/exports/${exportId}`);
    expect(done.body.status).toBe("DONE");
    expect(done.body.downloadUrl).toMatch(/^\/api\/files\/.+\..+/);

    // Unduh tanpa cookie sama sekali: keabsahan hanya dari tanda tangan.
    const file = await download(done.body.downloadUrl);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(file.headers["content-disposition"]).toMatch(
      /attachment; filename="kartu-masuk-[A-Za-z0-9._-]+\.pdf"/,
    );
    expect(file.headers["cache-control"]).toMatch(/no-store/);
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    // Hanya akun yang belum ganti kata sandi yang dicetak.
    expect(t.printedCards.length).toBe(before + 1);
    const card: CardData = t.printedCards[t.printedCards.length - 1]!;
    expect(card.className).toBeTruthy();
    const names = card.students.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["Ani Pending", "Budi Pending", "Citra Pending"]));
    expect(names).not.toContain("Dedi Sudah Ganti");
    expect(names).not.toContain("Siswa Uji");
  });

  it("kata sandi di kartu COCOK dengan hash di database, sandi lama mati, dan akun wajib ganti saat masuk", async () => {
    const own = await makeSchoolWorld();
    const adm = await agentFor(t, own.admin.email!, PASSWORDS.teacher);
    const sid = await (async () => {
      const nis = `K${unique()}`.slice(0, 26);
      const user = await prisma.user.create({
        data: {
          schoolId: own.schoolId,
          role: "STUDENT",
          name: "Eka Kartu",
          loginId: nis,
          passwordHash: await argon2.hash("lama-lama-1", { type: argon2.argon2id }),
          mustChangePassword: true,
        },
      });
      const s = await prisma.student.create({ data: { userId: user.id, nis } });
      await prisma.classEnrollment.create({
        data: {
          studentId: s.id,
          classId: own.classA.id,
          academicYearId: own.yearId,
          startDate: D(own.today),
          openEnrollmentKey: `${s.id}|${own.yearId}`,
        },
      });
      return { id: s.id, nis, userId: user.id };
    })();

    const oldSession = await login(t, sid.nis, "lama-lama-1", { ip: "10.9.1.1" });
    expect(oldSession.status).toBe(200);

    const req = await adm.post(`/api/classes/${own.classA.id}/credential-cards`);
    expect(req.status).toBe(202);
    await t.runner.drain();
    const card = t.printedCards[t.printedCards.length - 1]!;
    const mine = card.students.find((s) => s.nis === sid.nis)!;
    expect(mine).toBeDefined();
    expect(mine.password).toHaveLength(10);
    expect(mine.password).not.toMatch(/[0O1lI]/);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: sid.userId } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(user.passwordHash!, mine.password)).toBe(true);
    expect(user.passwordHash).not.toContain(mine.password);
    expect(user.mustChangePassword).toBe(true);

    expect((await login(t, sid.nis, "lama-lama-1", { ip: "10.9.1.2" })).status).toBe(401);
    const fresh = await login(t, sid.nis, mine.password, { ip: "10.9.1.3" });
    expect(fresh.status).toBe(200);
    expect(fresh.body.user.mustChangePassword).toBe(true);
    // Sesi lama dicabut.
    const oldRt = (oldSession.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("hadirin_rt="))!
      .split(";")[0]!
      .slice("hadirin_rt=".length);
    expect(
      (await t.http().post("/api/auth/refresh").set("Cookie", `hadirin_rt=${oldRt}`)).status,
    ).toBe(401);

    // Audit mencatat ekspor tanpa kata sandi.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { schoolId: own.schoolId, action: "CREDENTIAL_CARDS_EXPORT" },
    });
    expect(audit.meta).toMatchObject({ count: 1 });
    expect(JSON.stringify(audit)).not.toContain(mine.password);
  });

  it("status ekspor: hanya pemohon atau admin sekolah yang sama; selain itu 404", async () => {
    const req = await homeroomA.post(`/api/classes/${w.classA.id}/credential-cards`);
    const id: string = req.body.exportId;
    expect((await homeroomA.get(`/api/exports/${id}`)).status).toBe(200);
    expect((await admin.get(`/api/exports/${id}`)).status).toBe(200);
    expect((await homeroomB.get(`/api/exports/${id}`)).status).toBe(404);
    expect((await adminOther.get(`/api/exports/${id}`)).status).toBe(404);
    expect((await t.http().get(`/api/exports/${id}`)).status).toBe(401);
    expect((await admin.get("/api/exports/0192f0a0-0000-7000-8000-000000000000")).status).toBe(404);
  });

  it("URL unduhan: tanda tangan palsu, token rusak, dan kedaluwarsa (5 menit) ditolak", async () => {
    const req = await homeroomA.post(`/api/classes/${w.classA.id}/credential-cards`);
    await t.runner.drain();
    const url: string = (await homeroomA.get(`/api/exports/${req.body.exportId}`)).body.downloadUrl;
    const token = url.replace("/api/files/", "");
    expect((await download(url)).status).toBe(200);

    const [payload, sig] = token.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ k: "exports/credential-cards/lain.pdf", n: "x.pdf", e: Date.now() + 9e9 })).toString("base64url")}.${sig}`;
    expect((await t.http().get(`/api/files/${tampered}`)).status).toBe(404);
    expect((await t.http().get(`/api/files/${payload}.salah`)).status).toBe(404);
    expect((await t.http().get("/api/files/sampah")).status).toBe(404);
    expect((await t.http().get("/api/files/..%2F..%2F.env")).status).toBe(404);

    t.clock.advanceMs(FILE_URL_TTL_MS + 1000);
    const expired = await t.http().get(url);
    expect(expired.status).toBe(404);
    expect(expired.body.error.code).toBe("NOT_FOUND");
    // Status memberi URL baru yang berlaku lagi.
    const again = await homeroomA.get(`/api/exports/${req.body.exportId}`);
    expect((await download(again.body.downloadUrl)).status).toBe(200);
  });
});

describe("job kartu masuk: idempoten dan tahan kegagalan", () => {
  it("dijalankan dua kali dengan payload sama: kata sandi tidak dibuat dua kali", async () => {
    const own = await makeSchoolWorld();
    const s1 = await prisma.user.create({
      data: {
        schoolId: own.schoolId,
        role: "STUDENT",
        name: "Fani Idem",
        loginId: `I${unique()}`.slice(0, 26),
        mustChangePassword: true,
      },
    });
    const stu = await prisma.student.create({ data: { userId: s1.id, nis: s1.loginId! } });
    await prisma.classEnrollment.create({
      data: {
        studentId: stu.id,
        classId: own.classA.id,
        academicYearId: own.yearId,
        startDate: D(own.today),
        openEnrollmentKey: `${stu.id}|${own.yearId}`,
      },
    });

    const handler = t.app.get(CredentialCardsHandler, { strict: false });
    const payload = {
      type: "credential-cards",
      classId: own.classA.id,
      requestedById: own.admin.userId,
      schoolId: own.schoolId,
      fileKey: `exports/credential-cards/idem-${unique()}.pdf`,
    };
    const printed = t.printedCards.length;

    await handler.handle(payload);
    const afterFirst = await prisma.user.findUniqueOrThrow({ where: { id: s1.id } });
    const pdfFirst = await t.storage.get(payload.fileKey);
    expect(pdfFirst).not.toBeNull();
    expect(t.printedCards.length).toBe(printed + 1);

    await handler.handle(payload); // diulang (misalnya sewa habis tetapi job sebenarnya sudah selesai)
    const afterSecond = await prisma.user.findUniqueOrThrow({ where: { id: s1.id } });
    expect(afterSecond.passwordHash).toBe(afterFirst.passwordHash);
    expect(t.printedCards.length).toBe(printed + 1);
    expect((await t.storage.get(payload.fileKey))!.equals(pdfFirst!)).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { schoolId: own.schoolId, action: "CREDENTIAL_CARDS_EXPORT" },
      }),
    ).toBe(1);
  });

  it("worker gagal setelah kata sandi diganti tetapi sebelum PDF ditulis: ulangan menghasilkan PDF yang konsisten dengan database", async () => {
    let attempts = 0;
    const flaky = await createTestApp([], {
      cardRenderer: async (data) => {
        attempts++;
        if (attempts === 1) throw new Error("penulisan PDF gagal");
        return renderCredentialCardsPdf(data);
      },
    });
    try {
      const own = await makeSchoolWorld();
      const adm = await agentFor(flaky, own.admin.email!, PASSWORDS.teacher);
      const user = await prisma.user.create({
        data: {
          schoolId: own.schoolId,
          role: "STUDENT",
          name: "Gani Gagal",
          loginId: `G${unique()}`.slice(0, 26),
          mustChangePassword: true,
        },
      });
      const stu = await prisma.student.create({ data: { userId: user.id, nis: user.loginId! } });
      await prisma.classEnrollment.create({
        data: {
          studentId: stu.id,
          classId: own.classA.id,
          academicYearId: own.yearId,
          startDate: D(own.today),
          openEnrollmentKey: `${stu.id}|${own.yearId}`,
        },
      });

      const req = await adm.post(`/api/classes/${own.classA.id}/credential-cards`);
      await flaky.runner.runOnce(); // percobaan 1 gagal
      const failed = await adm.get(`/api/exports/${req.body.exportId}`);
      expect(failed.body).toMatchObject({ status: "PENDING", downloadUrl: null });
      const firstPassword = flaky.printedCards[0]!.students[0]!.password;

      flaky.clock.advanceMs(60_000); // lewati backoff
      await flaky.runner.runOnce(); // percobaan 2 berhasil
      const ok = await adm.get(`/api/exports/${req.body.exportId}`);
      expect(ok.body.status).toBe("DONE");

      const finalCard = flaky.printedCards[flaky.printedCards.length - 1]!.students[0]!;
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(await argon2.verify(row.passwordHash!, finalCard.password)).toBe(true);
      // Kata sandi dari percobaan yang gagal tidak pernah sampai ke PDF dan tidak lagi berlaku.
      expect(finalCard.password).not.toBe(firstPassword);
      expect(await argon2.verify(row.passwordHash!, firstPassword)).toBe(false);
    } finally {
      await flaky.close();
    }
  });

  it("kelas tanpa akun yang perlu kartu menghasilkan PDF penjelasan, bukan galat", async () => {
    const own = await makeSchoolWorld();
    const adm = await agentFor(t, own.admin.email!, PASSWORDS.teacher);
    const req = await adm.post(`/api/classes/${own.classB.id}/credential-cards`);
    await t.runner.drain();
    const status = await adm.get(`/api/exports/${req.body.exportId}`);
    expect(status.body.status).toBe("DONE");
    expect(t.printedCards[t.printedCards.length - 1]!.students).toEqual([]);
  });

  it("PDF dengan 20 kartu berisi 3 halaman (8 kartu per halaman)", async () => {
    const students = Array.from({ length: 20 }, (_, i) => ({
      name: `Siswa ${i + 1}`,
      nis: `NIS${i + 1}`,
      password: "Abcdefgh23",
    }));
    const pdf = await renderCredentialCardsPdf({
      schoolName: "SMP Uji",
      className: "7A",
      students,
      appUrl: "http://localhost:3000",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;
    expect(pages).toBe(3);
  });
});

describe("penyimpanan berkas dan URL bertanda tangan", () => {
  it("kunci berkas tidak boleh keluar dari folder dasar", () => {
    for (const bad of [
      "../rahasia",
      "a/../../b",
      "/etc/passwd",
      "a//b",
      ".env",
      "a/./b",
      "C:\\x",
      "",
    ]) {
      expect(() => assertSafeKey(bad), bad).toThrow();
    }
    expect(() => assertSafeKey("exports/credential-cards/abc-123.pdf")).not.toThrow();
  });

  it("LocalFileStorage menulis dan membaca di folder dasar, menolak kunci berbahaya", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hadirin-storage-"));
    try {
      const store = new LocalFileStorage(dir);
      expect(await store.exists("a/b.pdf")).toBe(false);
      expect(await store.get("a/b.pdf")).toBeNull();
      await store.put("a/b.pdf", Buffer.from("isi"));
      expect(await store.exists("a/b.pdf")).toBe(true);
      expect((await store.get("a/b.pdf"))!.toString()).toBe("isi");
      await expect(store.put("../keluar.txt", Buffer.from("x"))).rejects.toThrow();
      await expect(store.get("../../etc/passwd")).rejects.toThrow();
      expect((await fs.readdir(path.join(dir, "a"))).some((f) => f.endsWith(".tmp"))).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("FileUrlService: token berlaku sebelum kedaluwarsa dan perbandingan tanda tangan aman", () => {
    const svc = t.app.get(FileUrlService, { strict: false });
    const token = svc.sign("exports/x.pdf", "x.pdf");
    expect(svc.verify(token)).toEqual({ key: "exports/x.pdf", name: "x.pdf" });
    expect(svc.verify(`${token}x`)).toBeNull();
    expect(svc.verify(token.split(".")[0]!)).toBeNull();
    expect(svc.verify("")).toBeNull();
    const short = svc.sign("exports/x.pdf", "x.pdf", 1000);
    t.clock.advanceMs(1001);
    expect(svc.verify(short)).toBeNull();
  });
});
