import { Controller, Get, type INestApplication, type Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import argon2 from "argon2";
import request from "supertest";
import { FakeClock } from "@hadirin/domain";
import { dbTarget } from "../../scripts/lib/env";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { MemoryFileStorage } from "../../src/infra/file-storage";
import { MemoryMailer } from "../../src/infra/mailer";
import {
  CARD_RENDERER,
  renderCredentialCardsPdf,
  type CardData,
  type CardRenderer,
} from "../../src/modules/exports/credential-cards";
import { JobRunner } from "../../src/modules/jobs/job-runner";
import { CLOCK, FILE_STORAGE, MAILER } from "../../src/infra/tokens";
import { prisma, unique } from "./db";

/** Endpoint uji yang hanya dilindungi autentikasi (tanpa @AllowPendingPassword). */
@Controller("uji")
class ProbeController {
  @Get("terproteksi")
  protectedRoute(): { ok: true } {
    return { ok: true };
  }
}

export interface TestApp {
  app: INestApplication;
  clock: FakeClock;
  mailer: MemoryMailer;
  storage: MemoryFileStorage;
  /** Kartu masuk yang dicetak (termasuk kata sandi teks) selama tes, untuk diperiksa terhadap hash di database. */
  printedCards: CardData[];
  runner: JobRunner;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export async function createTestApp(
  extraControllers: Type[] = [],
  opts: { cardRenderer?: CardRenderer } = {},
): Promise<TestApp> {
  // Selalu database uji, apa pun isi .env.
  process.env.DB_NAME = dbTarget("test").database;
  process.env.COOKIE_SECURE = "false";
  const clock = new FakeClock(new Date());
  const mailer = new MemoryMailer();
  const storage = new MemoryFileStorage();
  const printedCards: CardData[] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [ProbeController, ...extraControllers],
  })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(MAILER)
    .useValue(mailer)
    .overrideProvider(FILE_STORAGE)
    .useValue(storage)
    .overrideProvider(CARD_RENDERER)
    .useValue(async (data: CardData) => {
      printedCards.push(data);
      return (opts.cardRenderer ?? renderCredentialCardsPdf)(data);
    })
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return {
    app,
    clock,
    mailer,
    storage,
    printedCards,
    runner: app.get(JobRunner, { strict: false }),
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

export const PASSWORDS = {
  admin: "Admin-uji-1",
  teacher: "Guru-uji-1",
  student: "Siswa-uji-1",
};

export interface Accounts {
  schoolId: string;
  adminEmail: string;
  adminUserId: string;
  teacherEmail: string;
  teacherUserId: string;
  teacherId: string;
  studentNis: string;
  studentUserId: string;
  studentId: string;
  parentUserId: string;
}

/** Satu sekolah dengan admin, guru, siswa (berkata sandi) dan orang tua (tanpa kata sandi). */
export async function makeAccounts(): Promise<Accounts> {
  const school = await prisma.school.create({
    data: { name: `Sekolah ${unique()}`, timezone: "Asia/Jakarta" },
  });
  const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });
  const adminEmail = `admin-${unique()}@uji.test`;
  const teacherEmail = `guru-${unique()}@uji.test`;
  const studentNis = `N${unique()}`.slice(0, 28);

  const admin = await prisma.user.create({
    data: {
      schoolId: school.id,
      role: "ADMIN",
      name: "Admin Uji",
      email: adminEmail,
      passwordHash: await hash(PASSWORDS.admin),
    },
  });
  const teacherUser = await prisma.user.create({
    data: {
      schoolId: school.id,
      role: "TEACHER",
      name: "Guru Uji",
      email: teacherEmail,
      passwordHash: await hash(PASSWORDS.teacher),
    },
  });
  const teacher = await prisma.teacher.create({ data: { userId: teacherUser.id } });
  const studentUser = await prisma.user.create({
    data: {
      schoolId: school.id,
      role: "STUDENT",
      name: "Siswa Uji",
      loginId: studentNis,
      passwordHash: await hash(PASSWORDS.student),
    },
  });
  const student = await prisma.student.create({
    data: { userId: studentUser.id, nis: studentNis },
  });
  const parentUser = await prisma.user.create({
    data: { schoolId: school.id, role: "PARENT", name: "Orang Tua Uji" },
  });
  return {
    schoolId: school.id,
    adminEmail,
    adminUserId: admin.id,
    teacherEmail,
    teacherUserId: teacherUser.id,
    teacherId: teacher.id,
    studentNis,
    studentUserId: studentUser.id,
    studentId: student.id,
    parentUserId: parentUser.id,
  };
}

/** Ambil nilai cookie dari header Set-Cookie. */
export function cookieValue(
  setCookie: string[] | string | undefined,
  name: string,
): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of list) {
    if (c.startsWith(`${name}=`)) return c.slice(name.length + 1).split(";")[0];
  }
  return undefined;
}

export function cookieHeader(pairs: Record<string, string | undefined>): string {
  return Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export async function login(
  t: TestApp,
  identifier: string,
  password: string,
  extra: { deviceId?: string; ip?: string } = {},
) {
  const req = t
    .http()
    .post("/api/auth/login")
    .set("X-Forwarded-For", extra.ip ?? "10.0.0.1");
  return req.send({ identifier, password, deviceId: extra.deviceId });
}

let agentIp = 0;

/** Agen supertest yang sudah login (cookie tersimpan). IP unik agar batas laju tidak saling mengganggu. */
export async function agentFor(t: TestApp, identifier: string, password: string) {
  const agent = request.agent(t.app.getHttpServer());
  const n = agentIp++;
  const res = await agent
    .post("/api/auth/login")
    .set("X-Forwarded-For", `10.3.${Math.floor(n / 250)}.${(n % 250) + 1}`)
    .send({ identifier, password });
  if (res.status !== 200)
    throw new Error(`Login ${identifier} gagal: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
