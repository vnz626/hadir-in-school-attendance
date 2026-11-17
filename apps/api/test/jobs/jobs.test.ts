import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../helpers/app";
import { prisma, unique } from "../helpers/db";
import { DbJobQueue, JOB_LEASE_MS, backoffMs } from "../../src/infra/job-queue";
import { JobRunner, type JobHandler } from "../../src/modules/jobs/job-runner";
import { PrismaService } from "../../src/infra/prisma.service";

let t: TestApp;
let queue: DbJobQueue;
let prismaSvc: PrismaService;

beforeAll(async () => {
  t = await createTestApp();
  prismaSvc = t.app.get(PrismaService);
  queue = new DbJobQueue(prismaSvc, t.clock);
});

afterAll(async () => {
  await t.close();
});

/** Antrean unik per tes supaya job tes lain tidak ikut diproses. */
const newQueue = () => `Q-${unique()}`;

function runnerWith(handler: JobHandler): JobRunner {
  return new JobRunner(prismaSvc, t.clock, [handler]);
}

describe("antrean job di tabel (tanpa Redis)", () => {
  it("enqueue dengan dedupeKey sama tidak membuat job kedua (UNIQUE di database)", async () => {
    const q = newQueue();
    const key = `k-${unique()}`;
    const a = await queue.enqueue({ queue: q, payload: { n: 1 }, dedupeKey: key });
    const b = await queue.enqueue({ queue: q, payload: { n: 2 }, dedupeKey: key });
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    expect(await prisma.job.count({ where: { dedupeKey: key } })).toBe(1);
  });

  it("enqueue serentak dengan dedupeKey sama: tepat satu job", async () => {
    const q = newQueue();
    const key = `k-${unique()}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => queue.enqueue({ queue: q, payload: {}, dedupeKey: key })),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
  });

  it("job yang berhasil menjadi DONE dan tidak diproses lagi", async () => {
    const q = newQueue();
    const seen: unknown[] = [];
    const runner = runnerWith({ queue: q, handle: async (p) => void seen.push(p) });
    const { id } = await queue.enqueue({ queue: q, payload: { halo: "dunia" } });
    expect(await runner.runOnce()).toBe(true);
    expect(await runner.runOnce()).toBe(false);
    expect(seen).toEqual([{ halo: "dunia" }]);
    const row = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "DONE", attempts: 1, lockedBy: null, lastError: null });
    expect(row.finishedAt).not.toBeNull();
  });

  it("job terjadwal di masa depan tidak jalan sebelum waktunya", async () => {
    const q = newQueue();
    const runner = runnerWith({ queue: q, handle: async () => undefined });
    await queue.enqueue({
      queue: q,
      payload: {},
      runAt: new Date(t.clock.now().getTime() + 60_000),
    });
    expect(await runner.runOnce()).toBe(false);
    t.clock.advanceMs(61_000);
    expect(await runner.runOnce()).toBe(true);
  });

  it("job gagal diulang dengan backoff eksponensial dan akhirnya FAILED dengan pesan galat", async () => {
    const q = newQueue();
    let calls = 0;
    const runner = runnerWith({
      queue: q,
      handle: async () => {
        calls++;
        throw new Error("penyedia mati");
      },
    });
    const { id } = await queue.enqueue({ queue: q, payload: {}, maxAttempts: 3 });

    expect(await runner.runOnce()).toBe(true);
    let row = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1, lastError: "penyedia mati" });
    expect(row.runAt.getTime()).toBeGreaterThanOrEqual(t.clock.now().getTime() + backoffMs(1) - 1);
    // Belum waktunya: tidak diproses.
    expect(await runner.runOnce()).toBe(false);

    t.clock.advanceMs(backoffMs(1) + 1000);
    await runner.runOnce();
    row = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 2 });
    expect(row.runAt.getTime()).toBeGreaterThan(t.clock.now().getTime() + backoffMs(1)); // makin lama

    t.clock.advanceMs(backoffMs(2) + 1000);
    await runner.runOnce();
    row = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "FAILED", attempts: 3, lastError: "penyedia mati" });
    expect(row.finishedAt).not.toBeNull();
    expect(calls).toBe(3);
    t.clock.advanceMs(24 * 3600_000);
    expect(await runner.runOnce()).toBe(false); // FAILED tidak diulang
  });

  it("backoff naik dua kali lipat dan dibatasi 1 jam", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(30)).toBe(3_600_000);
  });

  it("antrean tanpa handler yang terdaftar tidak diambil pekerja", async () => {
    const q = newQueue();
    const { id } = await queue.enqueue({ queue: q, payload: {} });
    const runner = runnerWith({ queue: newQueue(), handle: async () => undefined });
    expect(await runner.runOnce()).toBe(false);
    expect((await prisma.job.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });
});

describe("worker mati di tengah job: sewa habis, job diambil pekerja lain", () => {
  it("selama sewa berlaku tidak ada yang bisa mengambil; setelah habis, pekerja lain menyelesaikan; pekerja lama tidak menimpa hasilnya", async () => {
    const q = newQueue();
    const executed: string[] = [];
    const { id } = await queue.enqueue({ queue: q, payload: {} });

    // Pekerja A mengambil job lalu "mati" (tidak pernah complete/fail).
    const claimedByA = await queue.claim("worker-a", [q]);
    expect(claimedByA?.id).toBe(id);
    expect((await prisma.job.findUniqueOrThrow({ where: { id } })).status).toBe("RUNNING");

    const runnerB = runnerWith({ queue: q, handle: async () => void executed.push("B") });
    expect(await runnerB.runOnce()).toBe(false); // sewa A masih berlaku

    t.clock.advanceMs(JOB_LEASE_MS - 1000);
    expect(await runnerB.runOnce()).toBe(false);

    t.clock.advanceMs(2000); // sewa habis
    expect(await runnerB.runOnce()).toBe(true);
    expect(executed).toEqual(["B"]);
    const row = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "DONE", attempts: 2 });

    // A "hidup lagi" dan mencoba menyelesaikan: tidak boleh mengubah apa pun.
    await queue.complete(id, "worker-a");
    await queue.fail(claimedByA!, "worker-a", "terlambat");
    expect(await prisma.job.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "DONE",
      lastError: null,
    });
  });

  it("job yang kehabisan percobaan karena worker terus mati tetap bisa diambil sampai ada yang menyelesaikannya", async () => {
    const q = newQueue();
    const { id } = await queue.enqueue({ queue: q, payload: {}, maxAttempts: 5 });
    for (const w of ["a", "b"]) {
      expect(await queue.claim(`worker-${w}`, [q])).not.toBeNull();
      t.clock.advanceMs(JOB_LEASE_MS + 1000);
    }
    const runner = runnerWith({ queue: q, handle: async () => undefined });
    expect(await runner.runOnce()).toBe(true);
    expect(await prisma.job.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "DONE",
      attempts: 3,
    });
  });
});

describe("konkurensi pekerja", () => {
  it("banyak pekerja berebut satu job: handler berjalan tepat sekali", async () => {
    const q = newQueue();
    let executions = 0;
    const handler: JobHandler = {
      queue: q,
      handle: async () => {
        executions++;
        await new Promise((r) => setTimeout(r, 50));
      },
    };
    await queue.enqueue({ queue: q, payload: {} });
    const runners = Array.from({ length: 6 }, () => runnerWith(handler));
    const worked = await Promise.all(runners.map((r) => r.runOnce()));
    expect(worked.filter(Boolean)).toHaveLength(1);
    expect(executions).toBe(1);
  });

  it("banyak job dan banyak pekerja: setiap job diproses tepat sekali", async () => {
    const q = newQueue();
    const counts = new Map<number, number>();
    const handler: JobHandler = {
      queue: q,
      handle: async (p) => {
        const n = (p as { n: number }).n;
        counts.set(n, (counts.get(n) ?? 0) + 1);
      },
    };
    for (let n = 0; n < 20; n++) await queue.enqueue({ queue: q, payload: { n } });
    const runners = Array.from({ length: 5 }, () => runnerWith(handler));
    await Promise.all(runners.map((r) => r.drain()));
    expect(counts.size).toBe(20);
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
  });
});
