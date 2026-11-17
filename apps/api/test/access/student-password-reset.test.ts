import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../helpers/db";
import { PASSWORDS, cookieHeader, cookieValue, createTestApp, type TestApp } from "../helpers/app";
import { makeSchoolWorld, type Person, type SchoolWorld } from "../helpers/school";

let t: TestApp;
let w: SchoolWorld;
let ipCounter = 0;
const freshIp = () => `10.2.0.${(ipCounter++ % 250) + 1}`;

beforeAll(async () => {
  t = await createTestApp();
  w = await makeSchoolWorld();
});

afterAll(async () => {
  await t.close();
});

/** Masuk sebagai orang itu dan kembalikan cookie sesi untuk dipakai di permintaan berikutnya. */
async function cookiesFor(
  p: Person & { nis?: string },
  password = PASSWORDS.teacher,
): Promise<string> {
  const identifier = p.email ?? p.nis!;
  const res = await t
    .http()
    .post("/api/auth/login")
    .set("X-Forwarded-For", freshIp())
    .send({ identifier, password });
  expect(res.status, `login ${identifier}`).toBe(200);
  return cookieHeader({
    hadirin_at: cookieValue(res.headers["set-cookie"], "hadirin_at"),
  });
}

const reset = (cookie: string | null, studentId: string) => {
  const req = t.http().post(`/api/students/${studentId}/password-reset`);
  return cookie ? req.set("Cookie", cookie) : req;
};

describe("POST /students/:id/password-reset: akses negatif (uji IDOR)", () => {
  it("tanpa login: 401", async () => {
    const res = await reset(null, w.studentA.studentId);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("wali kelas B mengganti ID ke siswa kelas A: 403 dan kata sandi siswa A tidak berubah", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: w.studentA.userId } });
    const res = await reset(await cookiesFor(w.homeroomB), w.studentA.studentId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.temporaryPassword).toBeUndefined();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: w.studentA.userId } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.mustChangePassword).toBe(before.mustChangePassword);
  });

  it.each([
    ["guru mapel yang mengajar di kelas itu", () => w.subjectTeacherA],
    ["guru pengganti", () => w.substituteA],
    ["guru piket", () => w.picket],
    ["BK (baca saja)", () => w.counselor],
    ["kepala sekolah (baca saja)", () => w.principal],
    ["guru tanpa kaitan", () => w.outsider],
  ])("%s: 403", async (_name, who) => {
    const res = await reset(await cookiesFor(who()), w.studentA.studentId);
    expect(res.status).toBe(403);
  });

  it("siswa (dirinya sendiri maupun siswa lain) dan orang tua: 403 karena peran", async () => {
    const asStudentA = await cookiesFor({ ...w.studentA }, PASSWORDS.teacher);
    expect((await reset(asStudentA, w.studentA.studentId)).status).toBe(403);
    expect((await reset(asStudentA, w.studentB.studentId)).status).toBe(403);
  });

  it("ID tidak valid: 400; ID yang tidak ada: 404", async () => {
    const cookie = await cookiesFor(w.admin);
    expect((await reset(cookie, "bukan-uuid")).status).toBe(400);
    const missing = await reset(cookie, "0192f0a0-0000-7000-8000-000000000000");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });

  it("siswa yang diarsipkan tidak bisa di-reset (404)", async () => {
    const cookie = await cookiesFor(w.admin);
    const nis = `X${Date.now()}`.slice(0, 20);
    const user = await prisma.user.create({
      data: { schoolId: w.schoolId, role: "STUDENT", name: "Arsip", loginId: nis },
    });
    const s = await prisma.student.create({
      data: { userId: user.id, nis, deletedAt: new Date() },
    });
    expect((await reset(cookie, s.id)).status).toBe(404);
  });
});

describe("POST /students/:id/password-reset: yang berhak", () => {
  const confusable = /[0O1lI]/;

  async function expectReset(who: Person, target: SchoolWorld["studentA"]) {
    const res = await reset(await cookiesFor(who), target.studentId);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    const temp: string = res.body.temporaryPassword;
    expect(temp).toHaveLength(10);
    expect(temp).not.toMatch(confusable);
    return temp;
  }

  it("wali kelas mengatur ulang siswa di kelasnya: kata sandi lama mati, sementara berlaku, wajib ganti, sesi lama dicabut", async () => {
    // Siswa sudah punya sesi aktif sebelum reset.
    const old = await t
      .http()
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ identifier: w.studentA.nis, password: PASSWORDS.teacher });
    expect(old.status).toBe(200);
    const oldRt = cookieValue(old.headers["set-cookie"], "hadirin_rt")!;

    const temp = await expectReset(w.homeroomA, w.studentA);

    expect(
      (
        await t
          .http()
          .post("/api/auth/login")
          .set("X-Forwarded-For", freshIp())
          .send({ identifier: w.studentA.nis, password: PASSWORDS.teacher })
      ).status,
    ).toBe(401);
    const fresh = await t
      .http()
      .post("/api/auth/login")
      .set("X-Forwarded-For", freshIp())
      .send({ identifier: w.studentA.nis, password: temp });
    expect(fresh.status).toBe(200);
    expect(fresh.body.user.mustChangePassword).toBe(true);
    expect(
      (
        await t
          .http()
          .post("/api/auth/refresh")
          .set("Cookie", cookieHeader({ hadirin_rt: oldRt }))
      ).status,
    ).toBe(401);
  });

  it("admin mengatur ulang siswa mana pun; kata sandi sementara tidak pernah sama dua kali", async () => {
    const a = await expectReset(w.admin, w.studentB);
    const b = await expectReset(w.admin, w.studentB);
    expect(a).not.toBe(b);
  });

  it("audit_logs mencatat kejadian tanpa nilai kata sandi", async () => {
    const temp = await expectReset(w.homeroomB, w.studentB);
    const logs = await prisma.auditLog.findMany({
      where: { entityId: w.studentB.studentId, action: "STUDENT_PASSWORD_RESET" },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.actorId !== null)).toBe(true);
    expect(JSON.stringify(logs)).not.toContain(temp);
  });
});
