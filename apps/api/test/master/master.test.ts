import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@hadirin/domain";
import { PASSWORDS, agentFor, createTestApp, type TestApp } from "../helpers/app";
import { prisma, unique } from "../helpers/db";
import { makeSchoolWorld, type SchoolWorld } from "../helpers/school";

type Agent = Awaited<ReturnType<typeof agentFor>>;

let t: TestApp;
let w: SchoolWorld;
let other: SchoolWorld; // sekolah lain untuk uji isolasi
let admin: Agent;
let adminOther: Agent;
let homeroomA: Agent;
let homeroomB: Agent;
let subjectTeacherA: Agent;
let counselor: Agent;
let principal: Agent;
let picket: Agent;
let studentA: Agent;

beforeAll(async () => {
  t = await createTestApp();
  w = await makeSchoolWorld();
  other = await makeSchoolWorld();
  // Orang tua tidak punya kata sandi; beri satu khusus untuk tes akses (bukan perilaku produksi).
  const argon2 = (await import("argon2")).default;
  await prisma.user.update({
    where: { id: w.parentA.userId },
    data: {
      passwordHash: await argon2.hash(PASSWORDS.teacher),
      email: `ortu-${unique()}@uji.test`,
    },
  });
  const parentEmail = (await prisma.user.findUniqueOrThrow({ where: { id: w.parentA.userId } }))
    .email!;
  // Login orang tua lewat jalur email hanya berlaku untuk ADMIN/TEACHER, jadi uji orang tua memakai token langsung.
  void parentEmail;

  admin = await agentFor(t, w.admin.email!, PASSWORDS.teacher);
  adminOther = await agentFor(t, other.admin.email!, PASSWORDS.teacher);
  homeroomA = await agentFor(t, w.homeroomA.email!, PASSWORDS.teacher);
  homeroomB = await agentFor(t, w.homeroomB.email!, PASSWORDS.teacher);
  subjectTeacherA = await agentFor(t, w.subjectTeacherA.email!, PASSWORDS.teacher);
  counselor = await agentFor(t, w.counselor.email!, PASSWORDS.teacher);
  principal = await agentFor(t, w.principal.email!, PASSWORDS.teacher);
  picket = await agentFor(t, w.picket.email!, PASSWORDS.teacher);
  studentA = await agentFor(t, w.studentA.nis, PASSWORDS.teacher);
});

afterAll(async () => {
  await t.close();
});

// ---------------------------------------------------------------------------
// Definisi selesai Fase 2: tes akses negatif
// ---------------------------------------------------------------------------

describe("Definisi selesai: akses negatif", () => {
  it("guru A ke kelas guru B: 403", async () => {
    const res = await homeroomA.get(`/api/classes/${w.classB.id}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect((await homeroomA.get(`/api/classes/${w.classA.id}`)).status).toBe(200);
    expect((await homeroomB.get(`/api/classes/${w.classA.id}`)).status).toBe(403);
  });

  it("siswa ke data siswa lain: 403, ke dirinya sendiri: 200", async () => {
    const res = await studentA.get(`/api/students/${w.studentB.studentId}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.name).toBeUndefined();
    const own = await studentA.get(`/api/students/${w.studentA.studentId}`);
    expect(own.status).toBe(200);
    expect(own.body.nis).toBe(w.studentA.nis);
  });

  it("guru mapel ke pengaturan sekolah: 403 untuk baca dan tulis", async () => {
    const read = await subjectTeacherA.get("/api/settings/school");
    expect(read.status).toBe(403);
    expect(read.body.error.code).toBe("FORBIDDEN");
    expect(
      (await subjectTeacherA.put("/api/settings/school").send({ settings: { backfillDays: 30 } }))
        .status,
    ).toBe(403);
    expect((await picket.get("/api/settings/school")).status).toBe(403);
    expect((await homeroomA.get("/api/settings/school")).status).toBe(403);
  });
});

describe("akses per peran pada daftar", () => {
  it("siswa hanya melihat dirinya di GET /students; wali kelas hanya kelasnya", async () => {
    const mine = await studentA.get("/api/students");
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((s: { id: string }) => s.id)).toEqual([w.studentA.studentId]);

    const wali = await homeroomA.get("/api/students");
    expect(wali.body.data.map((s: { id: string }) => s.id)).toEqual([w.studentA.studentId]);
    const mapel = await subjectTeacherA.get("/api/students");
    expect(mapel.body.data).toEqual([]);
  });

  it("BK dan kepala sekolah melihat seluruh sekolah tetapi tidak bisa mengubah apa pun", async () => {
    for (const agent of [counselor, principal]) {
      const list = await agent.get("/api/students");
      expect(list.body.data.length).toBe(2);
      expect((await agent.post("/api/subjects").send({ code: "X", name: "X" })).status).toBe(403);
      expect((await agent.patch(`/api/classes/${w.classA.id}`).send({ name: "Ubah" })).status).toBe(
        403,
      );
      expect(
        (await agent.post(`/api/students/${w.studentA.studentId}/password-reset`)).status,
      ).toBe(403);
    }
    const settings = await counselor.get("/api/settings/school");
    expect(settings.status).toBe(200);
    expect(settings.body.readOnly).toBe(true);
    expect(
      (await counselor.put("/api/settings/school").send({ settings: { backfillDays: 10 } })).status,
    ).toBe(403);
  });

  it("data master yang hanya admin: guru, siswa, dan tanpa login ditolak", async () => {
    const adminOnly = [
      "/api/teachers",
      "/api/parents",
      "/api/student-parents",
      "/api/staff-positions",
      "/api/schedules",
      "/api/geofences",
    ];
    for (const path of adminOnly) {
      expect((await t.http().get(path)).status, `${path} tanpa login`).toBe(401);
      expect((await homeroomA.get(path)).status, `${path} wali kelas`).toBe(403);
      expect((await subjectTeacherA.get(path)).status, `${path} guru mapel`).toBe(403);
      expect((await studentA.get(path)).status, `${path} siswa`).toBe(403);
      expect((await admin.get(path)).status, `${path} admin`).toBe(200);
    }
  });

  it("guru boleh membaca kalender (tahun ajaran, semester, mapel, libur) tetapi tidak menulis", async () => {
    for (const path of ["/api/academic-years", "/api/terms", "/api/subjects", "/api/holidays"]) {
      expect((await subjectTeacherA.get(path)).status, path).toBe(200);
      expect((await studentA.get(path)).status, `${path} siswa`).toBe(403);
    }
    expect(
      (
        await homeroomA
          .post("/api/holidays")
          .send({ name: "X", dateFrom: w.today, dateTo: w.today, scope: "ALL" })
      ).status,
    ).toBe(403);
    expect(
      (
        await homeroomA
          .post("/api/academic-years")
          .send({ name: "Z", startDate: w.today, endDate: w.today })
      ).status,
    ).toBe(403);
  });

  it("siswa tidak bisa menulis data master apa pun", async () => {
    expect((await studentA.post("/api/students").send({ name: "Z", nis: "1" })).status).toBe(403);
    expect(
      (await studentA.patch(`/api/students/${w.studentA.studentId}`).send({ name: "Z" })).status,
    ).toBe(403);
    expect((await studentA.delete(`/api/students/${w.studentA.studentId}`)).status).toBe(403);
  });
});

describe("isolasi antar sekolah (admin sekolah lain tidak melihat atau mengubah)", () => {
  it("daftar tidak memuat data sekolah lain", async () => {
    const classes = await adminOther.get("/api/classes");
    const ids = classes.body.data.map((c: { id: string }) => c.id);
    expect(ids).not.toContain(w.classA.id);
    expect(ids).toContain(other.classA.id);
    const students = await adminOther.get("/api/students");
    expect(students.body.data.map((s: { id: string }) => s.id)).not.toContain(w.studentA.studentId);
  });

  it("mengganti ID ke data sekolah lain menghasilkan 404, bukan data atau perubahan", async () => {
    expect((await adminOther.get(`/api/classes/${w.classA.id}`)).status).toBe(404);
    expect((await adminOther.get(`/api/students/${w.studentA.studentId}`)).status).toBe(404);
    expect(
      (await adminOther.patch(`/api/students/${w.studentA.studentId}`).send({ name: "Dibajak" }))
        .status,
    ).toBe(404);
    expect((await adminOther.delete(`/api/students/${w.studentA.studentId}`)).status).toBe(404);
    expect(
      (await adminOther.post(`/api/students/${w.studentA.studentId}/password-reset`)).status,
    ).toBe(404);
    expect(
      (await adminOther.patch(`/api/classes/${w.classA.id}`).send({ name: "Dibajak" })).status,
    ).toBe(404);
    expect((await adminOther.delete(`/api/holidays/${w.classA.id}`)).status).toBe(404);
    // Merujuk entitas sekolah lain saat membuat data baru juga ditolak.
    const res = await adminOther
      .post("/api/classes")
      .send({ academicYearId: w.yearId, name: "Curang", grade: 7 });
    expect(res.status).toBe(404);
    const stu = await prisma.user.findUniqueOrThrow({ where: { id: w.studentA.userId } });
    expect(stu.name).not.toBe("Dibajak");
  });
});

// ---------------------------------------------------------------------------
// CRUD admin
// ---------------------------------------------------------------------------

describe("tahun ajaran dan semester", () => {
  it("CRUD, satu tahun aktif per sekolah, semester harus di dalam tahunnya", async () => {
    const y1 = await admin.post("/api/academic-years").send({
      name: `TA-${unique()}`.slice(0, 20),
      startDate: "2030-07-01",
      endDate: "2031-06-30",
      isActive: true,
    });
    expect(y1.status).toBe(201);
    const y2 = await admin.post("/api/academic-years").send({
      name: `TB-${unique()}`.slice(0, 20),
      startDate: "2031-07-01",
      endDate: "2032-06-30",
      isActive: true,
    });
    expect(y2.status).toBe(201);
    const list = await admin.get("/api/academic-years?pageSize=100");
    const active = list.body.data.filter((y: { isActive: boolean }) => y.isActive);
    expect(active.map((y: { id: string }) => y.id)).toEqual([y2.body.id]);

    const dup = await admin
      .post("/api/academic-years")
      .send({ name: y1.body.name, startDate: "2033-07-01", endDate: "2034-06-30" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CONFLICT");

    const reversed = await admin
      .post("/api/academic-years")
      .send({ name: "Terbalik", startDate: "2031-07-01", endDate: "2031-06-30" });
    expect(reversed.status).toBe(400);

    const outside = await admin.post("/api/terms").send({
      academicYearId: y1.body.id,
      semester: 1,
      startDate: "2030-06-01",
      endDate: "2030-12-20",
    });
    expect(outside.status).toBe(400);
    const term = await admin.post("/api/terms").send({
      academicYearId: y1.body.id,
      semester: 1,
      startDate: "2030-07-15",
      endDate: "2030-12-20",
    });
    expect(term.status).toBe(201);
    expect(
      (
        await admin.post("/api/terms").send({
          academicYearId: y1.body.id,
          semester: 1,
          startDate: "2030-07-15",
          endDate: "2030-12-20",
        })
      ).status,
    ).toBe(409);
    expect(
      (await admin.patch(`/api/terms/${term.body.id}`).send({ endDate: "2030-07-01" })).status,
    ).toBe(400);

    // Tahun yang punya semester tidak bisa dihapus; sesudah semester dihapus, bisa.
    const blocked = await admin.delete(`/api/academic-years/${y1.body.id}`);
    expect(blocked.status).toBe(409);
    expect((await admin.delete(`/api/terms/${term.body.id}`)).status).toBe(204);
    expect((await admin.delete(`/api/academic-years/${y1.body.id}`)).status).toBe(204);
  });

  it("paginasi, pencarian, dan urutan", async () => {
    const tag = unique().slice(0, 6);
    for (let i = 0; i < 3; i++) {
      await admin.post("/api/subjects").send({ code: `${tag}${i}`, name: `Mapel ${tag} ${3 - i}` });
    }
    const first = await admin.get(`/api/subjects?q=${tag}&pageSize=2&page=1&sort=code&order=asc`);
    expect(first.body.total).toBe(3);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.data[0].code).toBe(`${tag}0`);
    const second = await admin.get(`/api/subjects?q=${tag}&pageSize=2&page=2&sort=code&order=asc`);
    expect(second.body.data).toHaveLength(1);
    const desc = await admin.get(`/api/subjects?q=${tag}&sort=code&order=desc`);
    expect(desc.body.data[0].code).toBe(`${tag}2`);
    // kunci urut asing diabaikan, ukuran halaman berlebih ditolak
    expect((await admin.get("/api/subjects?sort=passwordHash")).status).toBe(200);
    expect((await admin.get("/api/subjects?pageSize=1000")).status).toBe(400);
  });
});

describe("mapel, kelas, guru", () => {
  it("mapel: kode unik, tidak bisa dihapus bila dipakai jadwal", async () => {
    const ok = await admin
      .post("/api/subjects")
      .send({ code: `M${unique()}`.slice(0, 18), name: "Fisika" });
    expect(ok.status).toBe(201);
    expect(
      (await admin.post("/api/subjects").send({ code: ok.body.code, name: "Lain" })).status,
    ).toBe(409);
    expect(
      (await admin.patch(`/api/subjects/${ok.body.id}`).send({ name: "Fisika Dasar" })).body.name,
    ).toBe("Fisika Dasar");
    const used = await admin.delete(`/api/subjects/${w.subjectId}`);
    expect(used.status).toBe(409);
    expect((await admin.delete(`/api/subjects/${ok.body.id}`)).status).toBe(204);
  });

  it("kelas: dibuat dengan wali kelas, diarsipkan (bukan dihapus), arsip tersembunyi kecuali diminta", async () => {
    const created = await admin.post("/api/classes").send({
      academicYearId: w.yearId,
      name: `K-${unique()}`.slice(0, 40),
      grade: 8,
      homeroomTeacherId: w.outsider.teacherId,
    });
    expect(created.status).toBe(201);
    expect(created.body.homeroomTeacherName).toBeTruthy();
    expect(created.body.studentCount).toBe(0);
    expect(
      (
        await admin
          .post("/api/classes")
          .send({ academicYearId: w.yearId, name: created.body.name, grade: 8 })
      ).status,
    ).toBe(409);
    expect((await admin.delete(`/api/classes/${created.body.id}`)).status).toBe(204);
    const hidden = await admin.get(`/api/classes?academicYearId=${w.yearId}&pageSize=100`);
    expect(hidden.body.data.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
    const shown = await admin.get(
      `/api/classes?academicYearId=${w.yearId}&includeArchived=true&pageSize=100`,
    );
    expect(shown.body.data.find((c: { id: string }) => c.id === created.body.id).archived).toBe(
      true,
    );
    expect(await prisma.class.count({ where: { id: created.body.id } })).toBe(1);
  });

  it("kelas: wali kelas dari sekolah lain ditolak", async () => {
    const res = await admin.post("/api/classes").send({
      academicYearId: w.yearId,
      name: `X-${unique()}`.slice(0, 40),
      grade: 7,
      homeroomTeacherId: other.homeroomA.teacherId,
    });
    expect(res.status).toBe(404);
  });

  it("guru: dibuat dengan kata sandi sementara satu kali, email unik, diarsipkan menonaktifkan login", async () => {
    const email = `guru-${unique()}@uji.test`;
    const created = await admin
      .post("/api/teachers")
      .send({ name: "Guru Baru", email, nip: `${unique()}`.slice(0, 20) });
    expect(created.status).toBe(201);
    expect(created.headers["cache-control"]).toMatch(/no-store/);
    const temp: string = created.body.temporaryPassword;
    expect(temp).toHaveLength(10);
    expect(created.body.teacher.mustChangePassword).toBe(true);
    expect(
      JSON.stringify((await admin.get(`/api/teachers?q=${encodeURIComponent(email)}`)).body),
    ).not.toContain(temp);
    expect((await admin.post("/api/teachers").send({ name: "Kembar", email })).status).toBe(409);

    // Bisa masuk dengan kata sandi sementara dan langsung dikunci sampai ganti sandi.
    const loginAgent = await agentFor(t, email, temp);
    expect((await loginAgent.get("/api/subjects")).status).toBe(403);

    expect((await admin.delete(`/api/teachers/${created.body.teacher.id}`)).status).toBe(204);
    const afterArchive = await t
      .http()
      .post("/api/auth/login")
      .set("X-Forwarded-For", "10.4.4.4")
      .send({ identifier: email, password: temp });
    expect(afterArchive.status).toBe(401);
  });

  it("jabatan guru: dibuat, dibatasi sekolah, dan berpengaruh ke akses", async () => {
    const created = await admin.post("/api/staff-positions").send({
      teacherId: w.outsider.teacherId,
      position: "PICKET",
      academicYearId: w.yearId,
      startsOn: addDays(w.today, -1),
    });
    expect(created.status).toBe(201);
    const bad = await admin.post("/api/staff-positions").send({
      teacherId: w.outsider.teacherId,
      position: "PICKET",
      academicYearId: w.yearId,
      startsOn: w.today,
      endsOn: addDays(w.today, -5),
    });
    expect(bad.status).toBe(400);
    expect(
      (
        await admin.post("/api/staff-positions").send({
          teacherId: other.outsider.teacherId,
          position: "PICKET",
          academicYearId: w.yearId,
          startsOn: w.today,
        })
      ).status,
    ).toBe(404);
    expect((await admin.delete(`/api/staff-positions/${created.body.id}`)).status).toBe(204);
  });
});

describe("siswa dan pendaftaran kelas", () => {
  it("membuat siswa dengan kelas: kata sandi sementara sekali, wajib ganti, terdaftar di kelas", async () => {
    const nis = `S${unique()}`.slice(0, 20);
    const res = await admin
      .post("/api/students")
      .send({ name: "Siswa Baru", nis, classId: w.classA.id });
    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.body.student).toMatchObject({
      nis,
      className: expect.any(String),
      mustChangePassword: true,
      archived: false,
    });
    expect(res.body.student.classId).toBe(w.classA.id);
    expect((await admin.post("/api/students").send({ name: "Kembar", nis })).status).toBe(409);

    const user = await prisma.user.findFirstOrThrow({ where: { loginId: nis } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(res.body.temporaryPassword);
    const enrollments = await prisma.classEnrollment.count({
      where: { studentId: res.body.student.id, endDate: null },
    });
    expect(enrollments).toBe(1);
  });

  it("memindahkan siswa: pendaftaran lama ditutup sehari sebelumnya, riwayat utuh, hanya satu yang terbuka", async () => {
    const nis = `P${unique()}`.slice(0, 20);
    const created = await admin.post("/api/students").send({
      name: "Pindahan",
      nis,
      classId: w.classA.id,
      enrollmentStartDate: addDays(w.today, -10),
    });
    const id = created.body.student.id;
    const moveOn = addDays(w.today, -3);
    const moved = await admin
      .post(`/api/students/${id}/enrollments`)
      .send({ classId: w.classB.id, startDate: moveOn });
    expect(moved.status).toBe(201);
    const [latest, previous] = moved.body;
    expect(latest).toMatchObject({ classId: w.classB.id, startDate: moveOn, endDate: null });
    expect(previous).toMatchObject({
      classId: w.classA.id,
      endDate: addDays(moveOn, -1),
      endReason: "MOVED_CLASS",
    });
    expect((await admin.get(`/api/students/${id}`)).body.classId).toBe(w.classB.id);

    expect(
      (
        await admin
          .post(`/api/students/${id}/enrollments`)
          .send({ classId: w.classB.id, startDate: w.today })
      ).status,
    ).toBe(409);
    expect(
      (
        await admin
          .post(`/api/students/${id}/enrollments`)
          .send({ classId: w.classA.id, startDate: addDays(moveOn, -5) })
      ).status,
    ).toBe(400);
    // Akses wali kelas ikut berpindah (AccessPolicy membaca pendaftaran terbuka).
    expect((await homeroomB.get(`/api/students/${id}`)).status).toBe(200);
    expect((await homeroomA.get(`/api/students/${id}`)).status).toBe(403);
  });

  it("mengubah NIS ikut mengubah login; diarsipkan menonaktifkan akun tetapi data tetap ada", async () => {
    const nis = `A${unique()}`.slice(0, 20);
    const created = await admin.post("/api/students").send({ name: "Arsip Aku", nis });
    const id = created.body.student.id;
    const nis2 = `B${unique()}`.slice(0, 20);
    const upd = await admin.patch(`/api/students/${id}`).send({ nis: nis2, name: "Nama Baru" });
    expect(upd.body).toMatchObject({ nis: nis2, name: "Nama Baru" });
    const user = await prisma.user.findFirstOrThrow({ where: { student: { id } } });
    expect(user.loginId).toBe(nis2);

    const withToken = await agentFor(t, nis2, created.body.temporaryPassword);
    void withToken;
    expect((await admin.delete(`/api/students/${id}`)).status).toBe(204);
    expect(await prisma.student.count({ where: { id } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(false);
    const hidden = await admin.get(`/api/students?q=${nis2}`);
    expect(hidden.body.data).toEqual([]);
    const shown = await admin.get(`/api/students?q=${nis2}&includeArchived=true`);
    expect(shown.body.data[0].archived).toBe(true);
    expect(
      (
        await t
          .http()
          .post("/api/auth/login")
          .set("X-Forwarded-For", "10.4.4.5")
          .send({ identifier: nis2, password: created.body.temporaryPassword })
      ).status,
    ).toBe(401);
  });

  it("filter siswa per kelas dan status", async () => {
    const inA = await admin.get(`/api/students?classId=${w.classA.id}&pageSize=100`);
    expect(inA.body.data.every((s: { classId: string }) => s.classId === w.classA.id)).toBe(true);
    expect(inA.body.data.length).toBeGreaterThan(0);
  });
});

describe("orang tua dan relasi", () => {
  it("orang tua tanpa kata sandi, nomor E.164 unik, opt-in tercatat sumbernya ADMIN", async () => {
    const phone = `+62800${Math.floor(Math.random() * 1e7)
      .toString()
      .padStart(7, "0")}`;
    const res = await admin
      .post("/api/parents")
      .send({ name: "Ibu Uji", phoneWa: phone, waOptIn: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ phoneWa: phone, waOptIn: true, childCount: 0 });
    const row = await prisma.parent.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { user: true },
    });
    expect(row.user.passwordHash).toBeNull();
    expect(row.waOptSource).toBe("ADMIN");
    expect(row.waOptInAt).not.toBeNull();

    expect((await admin.post("/api/parents").send({ name: "Dobel", phoneWa: phone })).status).toBe(
      409,
    );
    expect(
      (await admin.post("/api/parents").send({ name: "Salah", phoneWa: "08123456789" })).status,
    ).toBe(400);

    const out = await admin.patch(`/api/parents/${res.body.id}`).send({ waOptIn: false });
    expect(out.body.waOptIn).toBe(false);
    expect(
      (await prisma.parent.findUniqueOrThrow({ where: { id: res.body.id } })).waOptOutAt,
    ).not.toBeNull();
  });

  it("relasi siswa-orang tua: unik, dua anak satu orang tua, dibatasi sekolah", async () => {
    const parent = await admin.post("/api/parents").send({
      name: "Ortu Kakak Adik",
      phoneWa: `+62800${Math.floor(Math.random() * 1e7)
        .toString()
        .padStart(7, "0")}`,
    });
    const l1 = await admin.post("/api/student-parents").send({
      studentId: w.studentA.studentId,
      parentId: parent.body.id,
      relation: "Ibu",
      isPrimary: true,
    });
    expect(l1.status).toBe(201);
    expect(
      (
        await admin
          .post("/api/student-parents")
          .send({ studentId: w.studentA.studentId, parentId: parent.body.id, relation: "Ibu" })
      ).status,
    ).toBe(409);
    const l2 = await admin
      .post("/api/student-parents")
      .send({ studentId: w.studentB.studentId, parentId: parent.body.id, relation: "Ibu" });
    expect(l2.status).toBe(201);
    const list = await admin.get(`/api/parents?q=${encodeURIComponent("Ortu Kakak Adik")}`);
    expect(list.body.data[0].childCount).toBe(2);
    expect(
      (
        await admin
          .post("/api/student-parents")
          .send({ studentId: other.studentA.studentId, parentId: parent.body.id, relation: "Ibu" })
      ).status,
    ).toBe(404);
    expect((await admin.delete(`/api/student-parents/${l1.body.id}`)).status).toBe(204);
  });
});

describe("jadwal, libur, geofence", () => {
  it("jadwal: bentrok guru atau kelas pada jam beririsan ditolak dengan penjelasan", async () => {
    const base = {
      termId: w.termId,
      classId: w.classA.id,
      subjectId: w.subjectId,
      teacherId: w.outsider.teacherId,
      dayOfWeek: 3,
      startTime: 600,
      endTime: 645,
    };
    const ok = await admin.post("/api/schedules").send(base);
    expect(ok.status).toBe(201);
    expect(ok.body.className).toBeTruthy();

    const teacherClash = await admin
      .post("/api/schedules")
      .send({ ...base, classId: w.classB.id, startTime: 630, endTime: 680 });
    expect(teacherClash.status).toBe(409);
    expect(teacherClash.body.error.details.reason).toBe("TEACHER_CLASH");
    const classClash = await admin
      .post("/api/schedules")
      .send({ ...base, teacherId: w.picket.teacherId, startTime: 620, endTime: 650 });
    expect(classClash.status).toBe(409);
    expect(classClash.body.error.details.reason).toBe("CLASS_CLASH");
    // Bersebelahan (selesai 645, mulai 645) bukan bentrok.
    expect(
      (await admin.post("/api/schedules").send({ ...base, startTime: 645, endTime: 690 })).status,
    ).toBe(201);
    // Jam selesai tidak setelah jam mulai ditolak validasi.
    expect(
      (
        await admin
          .post("/api/schedules")
          .send({ ...base, dayOfWeek: 4, startTime: 700, endTime: 700 })
      ).status,
    ).toBe(400);
    // Memperpanjang jadwal sampai menabrak jadwal bersebelahan (645-690, guru dan kelas sama) juga ditolak;
    // bentrok guru diperiksa lebih dulu.
    const extend = await admin.patch(`/api/schedules/${ok.body.id}`).send({ endTime: 660 });
    expect(extend.status).toBe(409);
    expect(extend.body.error.details.reason).toBe("TEACHER_CLASH");
  });

  it("jadwal: kelas dan semester harus dari tahun ajaran yang sama, rujukan sekolah lain ditolak", async () => {
    const year2 = await prisma.academicYear.create({
      data: {
        schoolId: w.schoolId,
        name: unique().slice(0, 18),
        startDate: new Date("2040-01-01"),
        endDate: new Date("2040-12-31"),
      },
    });
    const term2 = await prisma.term.create({
      data: {
        academicYearId: year2.id,
        semester: 1,
        startDate: new Date("2040-01-01"),
        endDate: new Date("2040-06-30"),
      },
    });
    const mismatch = await admin.post("/api/schedules").send({
      termId: term2.id,
      classId: w.classA.id,
      subjectId: w.subjectId,
      teacherId: w.outsider.teacherId,
      dayOfWeek: 1,
      startTime: 400,
      endTime: 440,
    });
    expect(mismatch.status).toBe(400);
    const foreign = await admin.post("/api/schedules").send({
      termId: w.termId,
      classId: w.classA.id,
      subjectId: other.subjectId,
      teacherId: w.outsider.teacherId,
      dayOfWeek: 1,
      startTime: 400,
      endTime: 440,
    });
    expect(foreign.status).toBe(404);
  });

  it("jadwal yang sudah punya penugasan pengganti tidak bisa dihapus", async () => {
    const res = await admin.delete(`/api/schedules/${w.scheduleA.id}`);
    expect(res.status).toBe(409);
  });

  it("libur: aturan scope, rentang, dan filter irisan tanggal", async () => {
    const all = await admin
      .post("/api/holidays")
      .send({ name: "Libur Semua", dateFrom: "2031-08-17", dateTo: "2031-08-17", scope: "ALL" });
    expect(all.status).toBe(201);
    const grade = await admin.post("/api/holidays").send({
      name: "Ujian Tingkat",
      dateFrom: "2031-08-18",
      dateTo: "2031-08-20",
      scope: "GRADE",
      grade: 9,
    });
    expect(grade.body).toMatchObject({ scope: "GRADE", grade: 9, classId: null });
    const cls = await admin.post("/api/holidays").send({
      name: "Kelas Libur",
      dateFrom: "2031-08-21",
      dateTo: "2031-08-21",
      scope: "CLASS",
      classId: w.classA.id,
    });
    expect(cls.body.className).toBeTruthy();

    expect(
      (
        await admin
          .post("/api/holidays")
          .send({ name: "x", dateFrom: "2031-08-17", dateTo: "2031-08-16", scope: "ALL" })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin
          .post("/api/holidays")
          .send({ name: "x", dateFrom: "2031-08-17", dateTo: "2031-08-17", scope: "GRADE" })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post("/api/holidays").send({
          name: "x",
          dateFrom: "2031-08-17",
          dateTo: "2031-08-17",
          scope: "ALL",
          classId: w.classA.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post("/api/holidays").send({
          name: "x",
          dateFrom: "2031-08-17",
          dateTo: "2031-08-17",
          scope: "CLASS",
          classId: other.classA.id,
        })
      ).status,
    ).toBe(404);

    const range = await subjectTeacherA.get("/api/holidays?from=2031-08-19&to=2031-08-19");
    expect(range.body.data.map((h: { id: string }) => h.id)).toEqual([grade.body.id]);
    expect(
      (await admin.patch(`/api/holidays/${all.body.id}`).send({ dateTo: "2031-08-01" })).status,
    ).toBe(400);
    expect((await admin.delete(`/api/holidays/${all.body.id}`)).status).toBe(204);
  });

  it("geofence: batas koordinat dan radius, angka kembali sebagai angka", async () => {
    const ok = await admin
      .post("/api/geofences")
      .send({ name: "Gerbang", lat: -6.2, lng: 106.8, radiusM: 120 });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ lat: -6.2, lng: 106.8, radiusM: 120, isActive: true });
    expect(
      (await admin.post("/api/geofences").send({ name: "x", lat: 91, lng: 0, radiusM: 10 })).status,
    ).toBe(400);
    expect(
      (await admin.post("/api/geofences").send({ name: "x", lat: 0, lng: 181, radiusM: 10 }))
        .status,
    ).toBe(400);
    expect(
      (await admin.post("/api/geofences").send({ name: "x", lat: 0, lng: 0, radiusM: 0 })).status,
    ).toBe(400);
    expect(
      (await admin.patch(`/api/geofences/${ok.body.id}`).send({ isActive: false })).body.isActive,
    ).toBe(false);
    expect((await admin.delete(`/api/geofences/${ok.body.id}`)).status).toBe(204);
  });
});

describe("pengaturan sekolah", () => {
  it("admin membaca dan mengubah; validasi lintas bidang; perubahan tercatat tanpa nilai", async () => {
    const before = await admin.get("/api/settings/school");
    expect(before.status).toBe(200);
    expect(before.body.readOnly).toBe(false);
    expect(before.body.settings).toMatchObject({
      attendanceMode: "DAILY_ONLY",
      percentageRule: "EXCLUDE_EXCUSED",
    });

    const upd = await admin.put("/api/settings/school").send({
      school: { name: "SMP Uji Baru", timezone: "Asia/Jayapura" },
      settings: { attendanceMode: "BOTH", schoolDays: [1, 2, 3, 4, 5, 6], backfillDays: 5 },
    });
    expect(upd.status).toBe(200);
    expect(upd.body.school).toMatchObject({ name: "SMP Uji Baru", timezone: "Asia/Jayapura" });
    expect(upd.body.settings).toMatchObject({
      attendanceMode: "BOTH",
      backfillDays: 5,
      schoolDays: [1, 2, 3, 4, 5, 6],
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { schoolId: w.schoolId, action: "SETTINGS_UPDATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(audit.meta)).toContain("backfillDays");
    expect(JSON.stringify(audit.meta)).not.toContain("Jayapura");

    expect(
      (await admin.put("/api/settings/school").send({ settings: { dailyCloseTime: 400 } })).status,
    ).toBe(400); // tutup sebelum masuk (07:00)
    expect(
      (await admin.put("/api/settings/school").send({ settings: { schoolDays: [1, 1, 2] } }))
        .status,
    ).toBe(400);
    expect(
      (await admin.put("/api/settings/school").send({ settings: { checkinModes: [] } })).status,
    ).toBe(400);
    expect(
      (await admin.put("/api/settings/school").send({ settings: { dailyStartTime: 1440 } })).status,
    ).toBe(400);
    expect(
      (await admin.put("/api/settings/school").send({ school: { timezone: "Bukan/Zona" } })).status,
    ).toBe(400);
    expect(
      (await admin.put("/api/settings/school").send({ settings: { adhocSessionMinutes: 241 } }))
        .status,
    ).toBe(400);
    // Gagal validasi tidak mengubah apa pun.
    expect((await admin.get("/api/settings/school")).body.settings.backfillDays).toBe(5);
  });

  it("kepala sekolah membaca tetapi tidak menulis; sekolah lain punya pengaturannya sendiri", async () => {
    expect((await principal.get("/api/settings/school")).body.readOnly).toBe(true);
    expect(
      (await principal.put("/api/settings/school").send({ settings: { backfillDays: 1 } })).status,
    ).toBe(403);
    const otherSettings = await adminOther.get("/api/settings/school");
    expect(otherSettings.body.settings.backfillDays).toBe(7);
  });
});
