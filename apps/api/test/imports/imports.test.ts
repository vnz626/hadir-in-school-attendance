import ExcelJS from "exceljs";
import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSWORDS, agentFor, createTestApp, type TestApp } from "../helpers/app";
import { prisma, unique } from "../helpers/db";
import { makeSchoolWorld, type SchoolWorld } from "../helpers/school";

type Agent = Awaited<ReturnType<typeof agentFor>>;

let t: TestApp;
let w: SchoolWorld;
let other: SchoolWorld;
let admin: Agent;
let adminOther: Agent;
let homeroomA: Agent;
let studentA: Agent;
let className: string;

beforeAll(async () => {
  t = await createTestApp();
  w = await makeSchoolWorld();
  other = await makeSchoolWorld();
  // Impor siswa memakai tahun ajaran AKTIF.
  await prisma.academicYear.update({ where: { id: w.yearId }, data: { isActive: true } });
  className = (await prisma.class.findUniqueOrThrow({ where: { id: w.classA.id } })).name;
  admin = await agentFor(t, w.admin.email!, PASSWORDS.teacher);
  adminOther = await agentFor(t, other.admin.email!, PASSWORDS.teacher);
  homeroomA = await agentFor(t, w.homeroomA.email!, PASSWORDS.teacher);
  studentA = await agentFor(t, w.studentA.nis, PASSWORDS.teacher);
});

afterAll(async () => {
  await t.close();
});

async function xlsx(headers: string[], rows: Array<Array<string | number>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Awalan acak: unique() berbasis waktu sehingga awalannya sama antar tes. */
const randomTag = () => Math.random().toString(36).slice(2, 8);

const upload = (agent: Agent, kind: string, file: Buffer, filename = "data.xlsx") =>
  agent.post("/api/imports").field("kind", kind).attach("file", file, filename);

describe("templat", () => {
  it("unduh templat xlsx dan csv per jenis; hanya admin", async () => {
    for (const kind of ["STUDENTS", "TEACHERS", "PARENTS"]) {
      const x = await admin
        .get(`/api/imports/templates/${kind}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(x.status).toBe(200);
      expect(x.headers["content-disposition"]).toContain(`templat-${kind.toLowerCase()}.xlsx`);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(x.body as Buffer) as unknown as ArrayBuffer);
      expect(wb.worksheets[0]!.getRow(1).values).toBeTruthy();
    }
    const csv = await admin.get("/api/imports/templates/STUDENTS?format=csv");
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("nis,nama,nisn,kelas,tanggal_masuk");
    expect((await homeroomA.get("/api/imports/templates/STUDENTS")).status).toBe(403);
    expect((await t.http().get("/api/imports/templates/STUDENTS")).status).toBe(401);
  });
});

describe("Definisi selesai: impor 200 baris dengan 5 baris salah", () => {
  it("195 sukses + 5 penjelasan; baris salah tidak dibuat; riwayat laporan lengkap", async () => {
    const tag = randomTag().toUpperCase();
    // Satu NIS sudah ada di sistem (baris salah ke-4).
    const existing = await admin
      .post("/api/students")
      .send({ name: "Sudah Ada", nis: `${tag}-ADA` });
    expect(existing.status).toBe(201);

    const rows: Array<Array<string | number>> = [];
    for (let i = 1; i <= 200; i++)
      rows.push([`${tag}-${i}`, `Siswa Impor ${i}`, "", className, ""]);
    rows[9] = ["", "Tanpa NIS", "", className, ""]; // baris data 10 -> baris berkas 11
    rows[29] = [`${tag}-31`, "NIS Ganda", "", className, ""]; // sama dengan baris data 31 (NIS tag-31 muncul dua kali)
    rows[49] = [`${tag}-50`, "Kelas Salah", "", "Kelas-Tidak-Ada", ""];
    rows[69] = [`${tag}-ADA`, "Sudah Terdaftar", "", className, ""];
    rows[89] = [`${tag}-90`, "Tanggal Salah", "", className, "31/02/2026"];

    const preview = await upload(
      admin,
      "STUDENTS",
      await xlsx(["nis", "nama", "nisn", "kelas", "tanggal_masuk"], rows),
    );
    expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({
      kind: "STUDENTS",
      totalRows: 200,
      validRows: 195,
      errorRows: 5,
    });
    expect(preview.body.errors).toHaveLength(5);

    const byRow = new Map<number, { field: string; message: string }>(
      preview.body.errors.map((e: { row: number; field: string; message: string }) => [e.row, e]),
    );
    expect(byRow.get(11)).toMatchObject({ field: "nis", message: "NIS wajib diisi." });
    // NIS ganda dilaporkan pada kemunculan KEDUA (baris 32), menunjuk ke yang pertama (baris 31).
    expect(byRow.get(32)?.message).toMatch(/NIS ganda: sudah ada di baris 31/);
    expect(byRow.get(51)).toMatchObject({ field: "kelas" });
    expect(byRow.get(51)!.message).toContain("Kelas-Tidak-Ada");
    expect(byRow.get(71)).toMatchObject({
      field: "nis",
      message: "NIS sudah terdaftar di sistem.",
    });
    expect(byRow.get(91)).toMatchObject({ field: "tanggal_masuk" });
    for (const e of preview.body.errors) expect(e.message.length).toBeGreaterThan(5);

    // Pratinjau belum membuat data apa pun.
    expect(await prisma.student.count({ where: { nis: { startsWith: `${tag}-` } } })).toBe(1);

    // Tanpa "baris valid saja" ditolak.
    const refused = await admin
      .post(`/api/imports/${preview.body.id}/commit`)
      .send({ validRowsOnly: false });
    expect(refused.status).toBe(409);
    expect(refused.body.error.details.errorRows).toBe(5);
    expect(await prisma.student.count({ where: { nis: { startsWith: `${tag}-` } } })).toBe(1);

    const done = await admin
      .post(`/api/imports/${preview.body.id}/commit`)
      .send({ validRowsOnly: true });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ created: 195, skipped: 5, failed: [] });
    expect(done.body.exportIds).toHaveLength(1);

    expect(await prisma.student.count({ where: { nis: { startsWith: `${tag}-` } } })).toBe(196); // 195 + yang sudah ada
    const enrolled = await prisma.classEnrollment.count({
      where: { classId: w.classA.id, endDate: null, student: { nis: { startsWith: `${tag}-` } } },
    });
    expect(enrolled).toBe(195);
    const sample = await prisma.user.findFirstOrThrow({ where: { loginId: `${tag}-7` } });
    expect(sample).toMatchObject({
      passwordHash: null,
      mustChangePassword: true,
      role: "STUDENT",
      isActive: true,
    });
    expect(await prisma.student.count({ where: { nis: `${tag}-90` } })).toBe(0);

    const report = await admin.get(`/api/imports/${preview.body.id}/report`);
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({
      status: "COMMITTED",
      totalRows: 200,
      validRows: 195,
      errorRows: 5,
    });
    expect(report.body.rows.filter((r: { result: string }) => r.result === "CREATED")).toHaveLength(
      195,
    );
    expect(report.body.rows.filter((r: { result: string }) => r.result === "SKIPPED")).toHaveLength(
      5,
    );

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { schoolId: w.schoolId, action: "IMPORT_COMMITTED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.meta).toMatchObject({ kind: "STUDENTS", created: 195, skipped: 5 });
  }, 120_000);

  it("semua baris valid: impor penuh tanpa perlu 'baris valid saja'", async () => {
    const tag = randomTag().toUpperCase();
    const preview = await upload(
      admin,
      "STUDENTS",
      await xlsx(
        ["nis", "nama"],
        [
          [`${tag}1`, "Satu"],
          [`${tag}2`, "Dua"],
        ],
      ),
    );
    expect(preview.body).toMatchObject({ validRows: 2, errorRows: 0 });
    const done = await admin.post(`/api/imports/${preview.body.id}/commit`).send({});
    expect(done.body).toMatchObject({ created: 2, skipped: 0, exportIds: [] }); // tanpa kelas: tanpa kartu
  });
});

describe("pengaman impor", () => {
  it("commit dua kali ditolak; commit serentak hanya menghasilkan satu eksekusi", async () => {
    const tag = randomTag().toUpperCase();
    const preview = await upload(
      admin,
      "STUDENTS",
      await xlsx(
        ["nis", "nama", "kelas"],
        [
          [`${tag}A`, "A", className],
          [`${tag}B`, "B", className],
        ],
      ),
    );
    const results = await Promise.all(
      [1, 2, 3].map(() => admin.post(`/api/imports/${preview.body.id}/commit`).send({})),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await prisma.student.count({ where: { nis: { startsWith: tag } } })).toBe(2);
    expect((await admin.post(`/api/imports/${preview.body.id}/commit`).send({})).status).toBe(409);
  });

  it("kolom wajib hilang, berkas rusak, berkas kosong, dan tanpa berkas ditolak dengan penjelasan", async () => {
    const missing = await upload(admin, "STUDENTS", await xlsx(["nama"], [["Tanpa NIS"]]));
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.missingColumns).toEqual(["nis"]);
    expect(missing.body.error.message).toContain("nis");

    const binary = await upload(
      admin,
      "STUDENTS",
      Buffer.from([0, 1, 2, 3, 0, 255, 254, 0, 9, 9]),
      "x.xlsx",
    );
    expect(binary.status).toBe(400);
    const empty = await upload(
      admin,
      "STUDENTS",
      Buffer.from("nis,nama\r\n", "utf8"),
      "kosong.csv",
    );
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toMatch(/baris data/);
    const none = await admin.post("/api/imports").field("kind", "STUDENTS");
    expect(none.status).toBe(400);
    expect(
      (await upload(admin, "BUKAN_JENIS", await xlsx(["nis", "nama"], [["1", "a"]]))).status,
    ).toBe(400);
  });

  it("berkas lebih dari 2 MB ditolak", async () => {
    const big = Buffer.from(`nis,nama\r\n${"1,Siswa\r\n".repeat(400_000)}`, "utf8");
    expect(big.length).toBeGreaterThan(2 * 1024 * 1024);
    const res = await upload(admin, "STUDENTS", big, "besar.csv");
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("jenis berkas ditentukan dari isi, bukan ekstensi: CSV bernama .xlsx tetap terbaca", async () => {
    const tag = randomTag().toUpperCase();
    const csv = Buffer.from(
      `${String.fromCharCode(0xfeff)}NIS;Nama Lengkap;Kelas\r\n${tag}1;"Nama, dengan koma";${className}\r\n${tag}2;Dua;\r\n`,
      "utf8",
    );
    const res = await upload(admin, "STUDENTS", csv, "salah-ekstensi.xlsx");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ totalRows: 2, validRows: 2 });
    expect(res.body.sample[0].name).toBe("Nama, dengan koma");
  });

  it("sel Excel berupa angka tetap terbaca sebagai teks", async () => {
    const tag = randomTag();
    const res = await upload(
      admin,
      "STUDENTS",
      await xlsx(
        ["nis", "nama"],
        [[Number(`9${Date.now().toString().slice(-8)}`), `Angka ${tag}`]],
      ),
    );
    expect(res.status).toBe(201);
    expect(res.body.validRows).toBe(1);
    expect(typeof res.body.sample[0].nis).toBe("string");
  });

  it("tanpa tahun ajaran aktif, kolom kelas dijelaskan sebagai galat per baris", async () => {
    const bare = await makeSchoolWorld(); // tahun ajarannya tidak aktif
    const agent = await agentFor(t, bare.admin.email!, PASSWORDS.teacher);
    const res = await upload(
      agent,
      "STUDENTS",
      await xlsx(["nis", "nama", "kelas"], [[`Z${unique()}`.slice(0, 20), "A", "7A"]]),
    );
    expect(res.body.errorRows).toBe(1);
    expect(res.body.errors[0].message).toMatch(/tahun ajaran aktif/);
  });
});

describe("impor guru dan orang tua", () => {
  it("guru: email divalidasi dan unik; akun tanpa kata sandi (diatur lewat 'Lupa kata sandi?')", async () => {
    const tag = randomTag();
    const res = await upload(
      admin,
      "TEACHERS",
      await xlsx(
        ["nama", "email", "nip"],
        [
          ["Guru Satu", `satu-${tag}@uji.test`, `NIP${tag}1`],
          ["Guru Dua", `dua-${tag}@uji.test`, ""],
          ["Email Salah", "bukan-email", ""],
          ["Email Ganda", `satu-${tag}@uji.test`, ""],
          ["Email Ada", w.homeroomA.email!, ""],
        ],
      ),
    );
    expect(res.body).toMatchObject({ totalRows: 5, validRows: 2, errorRows: 3 });
    const done = await admin
      .post(`/api/imports/${res.body.id}/commit`)
      .send({ validRowsOnly: true });
    expect(done.body.created).toBe(2);
    const user = await prisma.user.findFirstOrThrow({ where: { email: `satu-${tag}@uji.test` } });
    expect(user).toMatchObject({ role: "TEACHER", passwordHash: null, mustChangePassword: true });

    // Guru baru mengatur kata sandi lewat tautan email.
    const before = t.mailer.sent.length;
    await t
      .http()
      .post("/api/auth/password/forgot")
      .set("X-Forwarded-For", "10.7.7.7")
      .send({ email: `satu-${tag}@uji.test` });
    expect(t.mailer.sent.length).toBe(before + 1);
  });

  it("orang tua: nomor 08xx dinormalisasi ke +62, NIS anak ditautkan, nomor ganda dan NIS tak dikenal dijelaskan", async () => {
    const tag = Math.floor(Math.random() * 1e6)
      .toString()
      .padStart(6, "0");
    const phone = `0812${tag}1`;
    const res = await upload(
      admin,
      "PARENTS",
      await xlsx(
        ["nama", "no_wa", "nis_anak", "hubungan"],
        [
          ["Ibu Satu", phone, `${w.studentA.nis}, ${w.studentB.nis}`, "Ibu"],
          ["Bapak Ganda", phone, "", ""],
          ["Ibu Salah Nomor", "123", "", ""],
          ["Ibu NIS Hilang", `0813${tag}2`, "NIS-TIDAK-ADA", ""],
        ],
      ),
    );
    expect(res.body).toMatchObject({ totalRows: 4, validRows: 1, errorRows: 3 });
    expect(res.body.sample[0].phoneWa).toBe(`+62812${tag}1`);
    const done = await admin
      .post(`/api/imports/${res.body.id}/commit`)
      .send({ validRowsOnly: true });
    expect(done.body.created).toBe(1);
    const parent = await prisma.parent.findUniqueOrThrow({
      where: { phoneWa: `+62812${tag}1` },
      include: { students: true, user: true },
    });
    expect(parent.students).toHaveLength(2);
    expect(parent.user.passwordHash).toBeNull();
    expect(parent.waOptIn).toBe(false);
  });
});

describe("akses negatif impor", () => {
  it("non-admin dan tanpa login ditolak di semua endpoint", async () => {
    const file = await xlsx(["nis", "nama"], [["1", "a"]]);
    expect((await upload(homeroomA, "STUDENTS", file)).status).toBe(403);
    expect((await upload(studentA, "STUDENTS", file)).status).toBe(403);
    expect(
      (await t.http().post("/api/imports").field("kind", "STUDENTS").attach("file", file, "a.xlsx"))
        .status,
    ).toBe(401);
    const preview = await upload(admin, "STUDENTS", file);
    expect((await homeroomA.post(`/api/imports/${preview.body.id}/commit`).send({})).status).toBe(
      403,
    );
    expect((await homeroomA.get(`/api/imports/${preview.body.id}/report`)).status).toBe(403);
  });

  it("admin sekolah lain tidak bisa menjalankan atau membaca impor sekolah ini (404)", async () => {
    const preview = await upload(
      admin,
      "STUDENTS",
      await xlsx(["nis", "nama"], [[`Q${unique()}`.slice(0, 20), "a"]]),
    );
    expect((await adminOther.post(`/api/imports/${preview.body.id}/commit`).send({})).status).toBe(
      404,
    );
    expect((await adminOther.get(`/api/imports/${preview.body.id}/report`)).status).toBe(404);
    expect(
      (await admin.get("/api/imports/0192f0a0-0000-7000-8000-000000000000/report")).status,
    ).toBe(404);
    expect((await admin.get("/api/imports/bukan-uuid/report")).status).toBe(400);
  });

  it("impor satu sekolah tidak melihat NIS sekolah lain sebagai duplikat", async () => {
    const nis = `X${unique()}`.slice(0, 20);
    const own = await upload(admin, "STUDENTS", await xlsx(["nis", "nama"], [[nis, "Siswa X"]]));
    await admin.post(`/api/imports/${own.body.id}/commit`).send({});
    // NIS sama di sekolah lain: students.nis unik global di skema, jadi dilaporkan lewat galat penyimpanan.
    const foreign = await upload(
      adminOther,
      "STUDENTS",
      await xlsx(["nis", "nama"], [[nis, "Siswa X lain"]]),
    );
    expect(foreign.body.validRows).toBe(1);
    const done = await adminOther.post(`/api/imports/${foreign.body.id}/commit`).send({});
    expect(done.body.created).toBe(0);
    expect(done.body.failed).toHaveLength(1);
    expect(done.body.failed[0].message).toMatch(/sudah ada/i);
  });
});

describe("kata sandi tidak pernah di database sebagai teks", () => {
  it("hash argon2id saja; verifikasi bekerja untuk akun yang dibuat manual", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: w.studentA.userId } });
    expect(await argon2.verify(u.passwordHash!, PASSWORDS.teacher)).toBe(true);
  });
});
