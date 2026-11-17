import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, unique } from "../helpers/db";
import {
  PASSWORDS,
  cookieHeader,
  cookieValue,
  createTestApp,
  login,
  makeAccounts,
  type Accounts,
  type TestApp,
} from "../helpers/app";

let t: TestApp;
let acc: Accounts;

beforeAll(async () => {
  t = await createTestApp();
  acc = await makeAccounts();
});

afterAll(async () => {
  await t.close();
});

let ipCounter = 0;
/** IP unik per tes supaya batas laju per IP tidak saling mengganggu. */
const freshIp = () => `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

describe("login", () => {
  it("siswa masuk dengan NIS; token hanya di cookie httpOnly, tidak di badan respons", async () => {
    const res = await login(t, acc.studentNis, PASSWORDS.student, { ip: freshIp() });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: acc.studentUserId,
      role: "STUDENT",
      mustChangePassword: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/token|jwt|eyJ/i);

    const cookies = res.headers["set-cookie"] as unknown as string[];
    const at = cookies.find((c) => c.startsWith("hadirin_at="))!;
    const rt = cookies.find((c) => c.startsWith("hadirin_rt="))!;
    expect(at).toMatch(/HttpOnly/i);
    expect(at).toMatch(/SameSite=Lax/i);
    expect(at).toMatch(/Path=\/;/);
    expect(at).not.toMatch(/Secure/i); // COOKIE_SECURE=false di lokal
    expect(rt).toMatch(/HttpOnly/i);
    expect(rt).toMatch(/Path=\/api\/auth/);
  });

  it("guru dan admin masuk dengan email", async () => {
    const teacher = await login(t, acc.teacherEmail, PASSWORDS.teacher, { ip: freshIp() });
    expect(teacher.status).toBe(200);
    expect(teacher.body.user.role).toBe("TEACHER");
    const admin = await login(t, acc.adminEmail, PASSWORDS.admin, { ip: freshIp() });
    expect(admin.status).toBe(200);
    expect(admin.body.user.role).toBe("ADMIN");
  });

  it("galat tidak membocorkan mana yang salah: akun tidak ada dan kata sandi salah identik", async () => {
    const wrongPw = await login(t, acc.studentNis, "salah-banget", { ip: freshIp() });
    const noUser = await login(t, "tidak-ada-nis", "salah-banget", { ip: freshIp() });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body);
    expect(wrongPw.body.error.code).toBe("UNAUTHENTICATED");
    expect(wrongPw.body.error.message).toBe("Email/NIS atau kata sandi tidak cocok.");
  });

  it("peran tidak boleh masuk lewat jalur yang salah: siswa dengan email, guru dengan NIS", async () => {
    expect(
      (await login(t, acc.teacherEmail.replace("@", "@x"), PASSWORDS.teacher, { ip: freshIp() }))
        .status,
    ).toBe(401);
    expect(
      (await login(t, `${acc.teacherEmail}`.split("@")[0]!, PASSWORDS.teacher, { ip: freshIp() }))
        .status,
    ).toBe(401);
  });

  it("orang tua (tanpa kata sandi) tidak bisa masuk dengan kata sandi", async () => {
    const parent = await prisma.user.findUniqueOrThrow({ where: { id: acc.parentUserId } });
    expect(parent.passwordHash).toBeNull();
    const res = await login(t, "orang-tua", "", { ip: freshIp() });
    expect(res.status).toBe(400); // kata sandi kosong ditolak validasi
    expect((await login(t, "orang-tua", "apa-saja-1", { ip: freshIp() })).status).toBe(401);
  });

  it("akun nonaktif atau diarsipkan tidak bisa masuk", async () => {
    const other = await makeAccounts();
    await prisma.user.update({ where: { id: other.studentUserId }, data: { isActive: false } });
    expect((await login(t, other.studentNis, PASSWORDS.student, { ip: freshIp() })).status).toBe(
      401,
    );
    await prisma.user.update({
      where: { id: other.studentUserId },
      data: { isActive: true, deletedAt: new Date() },
    });
    expect((await login(t, other.studentNis, PASSWORDS.student, { ip: freshIp() })).status).toBe(
      401,
    );
  });

  it("kata sandi tersimpan sebagai argon2id", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: acc.studentUserId } });
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("input tidak valid menghasilkan format galat seragam VALIDATION_ERROR", async () => {
    const res = await t.http().post("/api/auth/login").send({ identifier: "", password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(typeof res.body.error.message).toBe("string");
    expect(res.body.error.details.issues[0]).toHaveProperty("path");
  });
});

describe("pembatasan percobaan masuk (Rancangan §12.6)", () => {
  it("5 gagal per akun mengunci akun 15 menit, bahkan untuk kata sandi benar; terbuka lagi setelah jeda", async () => {
    const own = await makeAccounts();
    for (let i = 0; i < 5; i++) {
      expect((await login(t, own.studentNis, "salah-terus", { ip: freshIp() })).status).toBe(401);
    }
    const locked = await login(t, own.studentNis, PASSWORDS.student, { ip: freshIp() });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("RATE_LIMITED");
    expect(locked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);

    t.clock.advanceMs(15 * 60_000 + 1000);
    expect((await login(t, own.studentNis, PASSWORDS.student, { ip: freshIp() })).status).toBe(200);
  });

  it("login berhasil menghapus hitungan gagal", async () => {
    const own = await makeAccounts();
    for (let i = 0; i < 4; i++) await login(t, own.studentNis, "salah", { ip: freshIp() });
    expect((await login(t, own.studentNis, PASSWORDS.student, { ip: freshIp() })).status).toBe(200);
    for (let i = 0; i < 4; i++)
      expect((await login(t, own.studentNis, "salah", { ip: freshIp() })).status).toBe(401);
  });

  it("batas per IP: permintaan ke-61 dalam semenit ditolak, jendela bergeser setelahnya", async () => {
    const ip = freshIp();
    for (let i = 0; i < 60; i++) {
      const r = await login(t, `acak-${unique()}`, "salah-salah", { ip });
      expect(r.status).toBe(401);
    }
    expect((await login(t, `acak-${unique()}`, "salah-salah", { ip })).status).toBe(429);
    t.clock.advanceMs(61_000);
    expect((await login(t, `acak-${unique()}`, "salah-salah", { ip })).status).toBe(401);
  });

  it("IP berbeda tidak saling menghambat (seluruh sekolah sering satu IP, tapi batas akun tetap per akun)", async () => {
    const a = await makeAccounts();
    const b = await makeAccounts();
    for (let i = 0; i < 5; i++) await login(t, a.studentNis, "salah", { ip: "10.9.9.9" });
    expect((await login(t, b.studentNis, PASSWORDS.student, { ip: "10.9.9.9" })).status).toBe(200);
  });
});

describe("sesi: akses, refresh, logout", () => {
  it("endpoint terproteksi menolak tanpa cookie, token rusak, dan token palsu", async () => {
    expect((await t.http().get("/api/uji/terproteksi")).status).toBe(401);
    expect(
      (await t.http().get("/api/uji/terproteksi").set("Cookie", "hadirin_at=bukan.jwt.valid"))
        .status,
    ).toBe(401);
    const forged = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(`{"sub":"${acc.adminUserId}","role":"ADMIN"}`).toString("base64url")}.`;
    const res = await t.http().get("/api/uji/terproteksi").set("Cookie", `hadirin_at=${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("token akses kedaluwarsa dalam 15 menit; refresh memulihkan sesi", async () => {
    const agent = (await import("supertest")).default.agent(t.app.getHttpServer());
    await agent
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ identifier: acc.studentNis, password: PASSWORDS.student });
    expect((await agent.get("/api/uji/terproteksi")).status).toBe(200);

    t.clock.advanceMs(15 * 60_000 + 5000);
    expect((await agent.get("/api/uji/terproteksi")).status).toBe(401);
    expect((await agent.post("/api/auth/refresh")).status).toBe(200);
    expect((await agent.get("/api/uji/terproteksi")).status).toBe(200);
  });

  it("refresh token dirotasi: token baru berbeda dan token lama tidak berlaku lagi", async () => {
    const res1 = await login(t, acc.studentNis, PASSWORDS.student, { ip: freshIp() });
    const rt1 = cookieValue(res1.headers["set-cookie"], "hadirin_rt")!;
    const res2 = await t
      .http()
      .post("/api/auth/refresh")
      .set("Cookie", cookieHeader({ hadirin_rt: rt1 }));
    expect(res2.status).toBe(200);
    const rt2 = cookieValue(res2.headers["set-cookie"], "hadirin_rt")!;
    expect(rt2).toBeTruthy();
    expect(rt2).not.toBe(rt1);
    const row1 = await prisma.refreshToken.findFirstOrThrow({
      where: { tokenHash: crypto.createHash("sha256").update(rt1).digest("hex") },
    });
    const row2 = await prisma.refreshToken.findFirstOrThrow({
      where: { tokenHash: crypto.createHash("sha256").update(rt2).digest("hex") },
    });
    expect(row1.revokedAt).not.toBeNull();
    expect(row1.replacedBy).toBe(row2.id);
    expect(row2.familyId).toBe(row1.familyId);
    // Hanya hash yang disimpan, bukan token asli.
    expect(row1.tokenHash).not.toBe(rt1);
    expect(row1.tokenHash).toHaveLength(64);
  });

  it("DETEKSI PEMAKAIAN ULANG: token lama dipakai lagi mencabut seluruh keluarga, termasuk token baru", async () => {
    const own = await makeAccounts();
    const res1 = await login(t, own.studentNis, PASSWORDS.student, { ip: freshIp() });
    const rt1 = cookieValue(res1.headers["set-cookie"], "hadirin_rt")!;
    const res2 = await t
      .http()
      .post("/api/auth/refresh")
      .set("Cookie", cookieHeader({ hadirin_rt: rt1 }));
    const rt2 = cookieValue(res2.headers["set-cookie"], "hadirin_rt")!;
    expect(res2.status).toBe(200);

    const replay = await t
      .http()
      .post("/api/auth/refresh")
      .set("Cookie", cookieHeader({ hadirin_rt: rt1 }));
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("UNAUTHENTICATED");

    // Pencuri maupun pemilik sah kehilangan sesi: token terbaru ikut dicabut.
    const newest = await t
      .http()
      .post("/api/auth/refresh")
      .set("Cookie", cookieHeader({ hadirin_rt: rt2 }));
    expect(newest.status).toBe(401);

    const family = await prisma.refreshToken.findMany({ where: { userId: own.studentUserId } });
    expect(family.length).toBe(2);
    expect(family.every((r) => r.revokedAt !== null)).toBe(true);
    const audit = await prisma.auditLog.findFirst({
      where: { actorId: own.studentUserId, action: "REFRESH_TOKEN_REUSE" },
    });
    expect(audit).not.toBeNull();
  });

  it("refresh serentak dengan token yang sama: paling banyak satu berhasil, keluarga akhirnya dicabut", async () => {
    const own = await makeAccounts();
    const res = await login(t, own.studentNis, PASSWORDS.student, { ip: freshIp() });
    const rt = cookieValue(res.headers["set-cookie"], "hadirin_rt")!;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        t
          .http()
          .post("/api/auth/refresh")
          .set("Cookie", cookieHeader({ hadirin_rt: rt })),
      ),
    );
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect(results.filter((r) => r.status === 401).length).toBeGreaterThanOrEqual(4);
  });

  it("refresh token kedaluwarsa ditolak", async () => {
    const res = await login(t, acc.studentNis, PASSWORDS.student, { ip: freshIp() });
    const rt = cookieValue(res.headers["set-cookie"], "hadirin_rt")!;
    t.clock.advanceMs(15 * 86_400_000);
    expect(
      (
        await t
          .http()
          .post("/api/auth/refresh")
          .set("Cookie", cookieHeader({ hadirin_rt: rt }))
      ).status,
    ).toBe(401);
  });

  it("refresh tanpa cookie atau dengan token asing ditolak, dan cookie dibersihkan", async () => {
    expect((await t.http().post("/api/auth/refresh")).status).toBe(401);
    const res = await t.http().post("/api/auth/refresh").set("Cookie", "hadirin_rt=token-asing");
    expect(res.status).toBe(401);
    expect((res.headers["set-cookie"] as unknown as string[]).join(" ")).toMatch(/hadirin_rt=;/);
  });

  it("logout mencabut keluarga token dan membersihkan cookie", async () => {
    const res = await login(t, acc.studentNis, PASSWORDS.student, { ip: freshIp() });
    const rt = cookieValue(res.headers["set-cookie"], "hadirin_rt")!;
    const out = await t
      .http()
      .post("/api/auth/logout")
      .set("Cookie", cookieHeader({ hadirin_rt: rt }));
    expect(out.status).toBe(204);
    expect((out.headers["set-cookie"] as unknown as string[]).join(" ")).toMatch(/hadirin_at=;/);
    expect(
      (
        await t
          .http()
          .post("/api/auth/refresh")
          .set("Cookie", cookieHeader({ hadirin_rt: rt }))
      ).status,
    ).toBe(401);
    // Logout tanpa sesi tetap aman (idempoten).
    expect((await t.http().post("/api/auth/logout")).status).toBe(204);
  });

  it("GET /auth/me mengembalikan profil sendiri", async () => {
    const agent = (await import("supertest")).default.agent(t.app.getHttpServer());
    await agent
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ identifier: acc.adminEmail, password: PASSWORDS.admin });
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ id: acc.adminUserId, role: "ADMIN" });
  });
});

describe("ganti kata sandi", () => {
  it("kata sandi awal wajib diganti: endpoint lain terkunci sampai diganti", async () => {
    const own = await makeAccounts();
    await prisma.user.update({
      where: { id: own.studentUserId },
      data: { mustChangePassword: true },
    });
    const agent = (await import("supertest")).default.agent(t.app.getHttpServer());
    const res = await agent
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ identifier: own.studentNis, password: PASSWORDS.student });
    expect(res.body.user.mustChangePassword).toBe(true);

    const blocked = await agent.get("/api/uji/terproteksi");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("FORBIDDEN");
    expect(blocked.body.error.details.reason).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    const changed = await agent
      .post("/api/auth/password/change")
      .send({ currentPassword: PASSWORDS.student, newPassword: "Baru-kuat-123" });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect((await agent.get("/api/uji/terproteksi")).status).toBe(200);

    // Kata sandi lama mati, yang baru hidup, dan jejak audit tidak memuat kata sandi.
    expect((await login(t, own.studentNis, PASSWORDS.student, { ip: freshIp() })).status).toBe(401);
    expect((await login(t, own.studentNis, "Baru-kuat-123", { ip: freshIp() })).status).toBe(200);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorId: own.studentUserId, action: "PASSWORD_CHANGED" },
    });
    expect(JSON.stringify(audit)).not.toMatch(/Baru-kuat|Siswa-uji/);
  });

  it("validasi: kata sandi saat ini salah, terlalu pendek, atau sama dengan yang lama", async () => {
    const own = await makeAccounts();
    const agent = (await import("supertest")).default.agent(t.app.getHttpServer());
    await agent
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ identifier: own.studentNis, password: PASSWORDS.student });

    const wrong = await agent
      .post("/api/auth/password/change")
      .send({ currentPassword: "bukan-ini", newPassword: "Baru-kuat-123" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.issues[0].path).toBe("currentPassword");
    const short = await agent
      .post("/api/auth/password/change")
      .send({ currentPassword: PASSWORDS.student, newPassword: "pendek" });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe("VALIDATION_ERROR");
    const same = await agent
      .post("/api/auth/password/change")
      .send({ currentPassword: PASSWORDS.student, newPassword: PASSWORDS.student });
    expect(same.status).toBe(400);
  });

  it("mengganti kata sandi mencabut sesi di perangkat lain", async () => {
    const own = await makeAccounts();
    const other = await login(t, own.studentNis, PASSWORDS.student, { ip: freshIp() });
    const otherRt = cookieValue(other.headers["set-cookie"], "hadirin_rt")!;
    const agent = (await import("supertest")).default.agent(t.app.getHttpServer());
    await agent
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ identifier: own.studentNis, password: PASSWORDS.student });
    expect(
      (
        await agent
          .post("/api/auth/password/change")
          .send({ currentPassword: PASSWORDS.student, newPassword: "Baru-kuat-123" })
      ).status,
    ).toBe(200);
    expect(
      (
        await t
          .http()
          .post("/api/auth/refresh")
          .set("Cookie", cookieHeader({ hadirin_rt: otherRt }))
      ).status,
    ).toBe(401);
  });

  it("menebak kata sandi saat ini dibatasi 5 kali", async () => {
    const own = await makeAccounts();
    const agent = (await import("supertest")).default.agent(t.app.getHttpServer());
    await agent
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ identifier: own.studentNis, password: PASSWORDS.student });
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await agent
            .post("/api/auth/password/change")
            .send({ currentPassword: `salah-${i}-xx`, newPassword: "Baru-kuat-123" })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await agent
          .post("/api/auth/password/change")
          .send({ currentPassword: PASSWORDS.student, newPassword: "Baru-kuat-123" })
      ).status,
    ).toBe(429);
  });
});

describe("atur ulang kata sandi guru dan admin lewat tautan", () => {
  const tokenFromMail = (body: string) => /token=([A-Za-z0-9_-]+)/.exec(body)![1]!;

  it("email tidak terdaftar dan siswa mendapat respons sama (202) tanpa surat", async () => {
    const before = t.mailer.sent.length;
    const a = await t
      .http()
      .post("/api/auth/password/forgot")
      .set("X-Forwarded-For", freshIp())
      .send({ email: "tidak-ada@uji.test" });
    expect(a.status).toBe(202);
    expect(t.mailer.sent.length).toBe(before);
  });

  it("alur lengkap: minta tautan, atur ulang, tautan sekali pakai, sesi lama dicabut", async () => {
    const own = await makeAccounts();
    const old = await login(t, own.teacherEmail, PASSWORDS.teacher, { ip: freshIp() });
    const oldRt = cookieValue(old.headers["set-cookie"], "hadirin_rt")!;

    const before = t.mailer.sent.length;
    expect(
      (
        await t
          .http()
          .post("/api/auth/password/forgot")
          .set("X-Forwarded-For", freshIp())
          .send({ email: own.teacherEmail })
      ).status,
    ).toBe(202);
    expect(t.mailer.sent.length).toBe(before + 1);
    const mail = t.mailer.sent[before]!;
    expect(mail.to).toBe(own.teacherEmail);
    const token = tokenFromMail(mail.body);

    const dbRow = await prisma.loginToken.findFirstOrThrow({
      where: { userId: own.teacherUserId, purpose: "PASSWORD_RESET" },
    });
    expect(dbRow.tokenHash).not.toBe(token); // hanya hash yang disimpan

    const reset = await t
      .http()
      .post("/api/auth/password/reset")
      .send({ token, newPassword: "Guru-baru-123" });
    expect(reset.status).toBe(204);
    expect((await login(t, own.teacherEmail, PASSWORDS.teacher, { ip: freshIp() })).status).toBe(
      401,
    );
    expect((await login(t, own.teacherEmail, "Guru-baru-123", { ip: freshIp() })).status).toBe(200);
    expect(
      (
        await t
          .http()
          .post("/api/auth/refresh")
          .set("Cookie", cookieHeader({ hadirin_rt: oldRt }))
      ).status,
    ).toBe(401);

    const again = await t
      .http()
      .post("/api/auth/password/reset")
      .send({ token, newPassword: "Guru-lain-1234" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("tautan kedaluwarsa setelah 30 menit dan tautan baru mematikan yang lama", async () => {
    const own = await makeAccounts();
    const start = t.mailer.sent.length;
    await t
      .http()
      .post("/api/auth/password/forgot")
      .set("X-Forwarded-For", freshIp())
      .send({ email: own.adminEmail });
    const first = tokenFromMail(t.mailer.sent[start]!.body);
    await t
      .http()
      .post("/api/auth/password/forgot")
      .set("X-Forwarded-For", freshIp())
      .send({ email: own.adminEmail });
    const second = tokenFromMail(t.mailer.sent[start + 1]!.body);

    expect(
      (
        await t
          .http()
          .post("/api/auth/password/reset")
          .send({ token: first, newPassword: "Admin-baru-123" })
      ).status,
    ).toBe(400);
    t.clock.advanceMs(31 * 60_000);
    expect(
      (
        await t
          .http()
          .post("/api/auth/password/reset")
          .send({ token: second, newPassword: "Admin-baru-123" })
      ).status,
    ).toBe(400);
  });

  it("permintaan tautan dibatasi 3 per 15 menit per email", async () => {
    const own = await makeAccounts();
    const start = t.mailer.sent.length;
    for (let i = 0; i < 5; i++) {
      await t
        .http()
        .post("/api/auth/password/forgot")
        .set("X-Forwarded-For", freshIp())
        .send({ email: own.adminEmail });
    }
    expect(t.mailer.sent.length - start).toBe(3);
  });
});

describe("perlindungan CSRF (cookie satu origin)", () => {
  const body = { identifier: "x", password: "y" };

  it("menolak permintaan lintas situs berdasarkan Sec-Fetch-Site dan Origin asing", async () => {
    const a = await t.http().post("/api/auth/login").set("Sec-Fetch-Site", "cross-site").send(body);
    expect(a.status).toBe(403);
    expect(a.body.error.code).toBe("FORBIDDEN");
    expect(
      (await t.http().post("/api/auth/login").set("Sec-Fetch-Site", "same-site").send(body)).status,
    ).toBe(403);
    expect(
      (await t.http().post("/api/auth/login").set("Origin", "https://jahat.example").send(body))
        .status,
    ).toBe(403);
    expect(
      (await t.http().post("/api/auth/logout").set("Origin", "https://jahat.example")).status,
    ).toBe(403);
  });

  it("mengizinkan same-origin, asal APP_ORIGIN, dan host yang diteruskan Next.js (tunnel)", async () => {
    expect(
      (await t.http().post("/api/auth/login").set("Sec-Fetch-Site", "same-origin").send(body))
        .status,
    ).toBe(401);
    expect(
      (await t.http().post("/api/auth/login").set("Origin", "http://localhost:3000").send(body))
        .status,
    ).toBe(401);
    const tunnel = await t
      .http()
      .post("/api/auth/login")
      .set("Origin", "https://contoh.trycloudflare.com")
      .set("X-Forwarded-Host", "contoh.trycloudflare.com")
      .send(body);
    expect(tunnel.status).toBe(401);
  });

  it("GET tidak diperiksa CSRF", async () => {
    expect((await t.http().get("/api/health").set("Sec-Fetch-Site", "cross-site")).status).toBe(
      200,
    );
  });
});

describe("registrasi perangkat pasif (Rancangan §12.3, tanpa penolakan)", () => {
  const sha = (deviceId: string) =>
    crypto
      .createHash("sha256")
      .update(deviceId + process.env.DEVICE_PEPPER!)
      .digest("hex");

  it("perangkat pertama dicatat ACTIVE/FIRST_LOGIN dengan hash, bukan deviceId asli", async () => {
    const own = await makeAccounts();
    const deviceId = crypto.randomBytes(16).toString("hex");
    const res = await login(t, own.studentNis, PASSWORDS.student, { deviceId, ip: freshIp() });
    expect(res.status).toBe(200);
    const devices = await prisma.device.findMany({ where: { studentId: own.studentId } });
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      status: "ACTIVE",
      bindMethod: "FIRST_LOGIN",
      deviceHash: sha(deviceId),
      activeStudentKey: own.studentId,
    });
    expect(JSON.stringify(devices)).not.toContain(deviceId);
  });

  it("login dari perangkat lain tidak ditolak dan tidak menimpa perangkat aktif", async () => {
    const own = await makeAccounts();
    const first = crypto.randomBytes(16).toString("hex");
    const second = crypto.randomBytes(16).toString("hex");
    await login(t, own.studentNis, PASSWORDS.student, { deviceId: first, ip: freshIp() });
    expect(
      (await login(t, own.studentNis, PASSWORDS.student, { deviceId: second, ip: freshIp() }))
        .status,
    ).toBe(200);
    const devices = await prisma.device.findMany({ where: { studentId: own.studentId } });
    expect(devices).toHaveLength(1);
    expect(devices[0]!.deviceHash).toBe(sha(first));
  });

  it("login serentak pertama kali tetap menghasilkan satu perangkat aktif", async () => {
    const own = await makeAccounts();
    const ids = Array.from({ length: 4 }, () => crypto.randomBytes(16).toString("hex"));
    const results = await Promise.all(
      ids.map((deviceId) =>
        login(t, own.studentNis, PASSWORDS.student, { deviceId, ip: freshIp() }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(
      await prisma.device.count({ where: { studentId: own.studentId, status: "ACTIVE" } }),
    ).toBe(1);
  });

  it("guru tanpa deviceId dan login siswa tanpa deviceId tidak membuat perangkat", async () => {
    const own = await makeAccounts();
    await login(t, own.studentNis, PASSWORDS.student, { ip: freshIp() });
    await login(t, own.teacherEmail, PASSWORDS.teacher, {
      deviceId: crypto.randomBytes(16).toString("hex"),
      ip: freshIp(),
    });
    expect(await prisma.device.count({ where: { studentId: own.studentId } })).toBe(0);
  });
});
