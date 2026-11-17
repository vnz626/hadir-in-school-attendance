import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, withQuery } from "./api";
import { DAY_NAMES, formatDate, minutesToTime, timeToMinutes } from "./format";
import { t, td } from "./i18n";
import { buildPayload } from "./payload";
import { RESOURCE_ORDER, buildResources } from "./resources";

describe("format jam dan tanggal", () => {
  it("menit <-> HH:MM tanpa zona waktu", () => {
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(450)).toBe("07:30");
    expect(minutesToTime(1439)).toBe("23:59");
    expect(timeToMinutes("07:30")).toBe(450);
    expect(timeToMinutes("7:05")).toBe(425);
    expect(timeToMinutes("24:00")).toBeNull();
    expect(timeToMinutes("07:60")).toBeNull();
    expect(timeToMinutes("abc")).toBeNull();
  });

  it("tanggal kalender ditampilkan apa adanya, tidak bergeser hari", () => {
    expect(formatDate("2026-07-13")).toBe("13 Jul 2026");
    expect(formatDate("2030-12-31")).toBe("31 Des 2030");
    expect(formatDate("bukan-tanggal")).toBe("bukan-tanggal");
    expect(DAY_NAMES[1]).toBe("Senin");
    expect(DAY_NAMES[7]).toBe("Minggu");
  });
});

describe("klien API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("withQuery melewati nilai kosong dan meng-encode", () => {
    expect(withQuery("/students", { q: "a b", page: 2, x: undefined, y: "", z: null })).toBe(
      "/students?q=a+b&page=2",
    );
    expect(withQuery("/students")).toBe("/students");
    expect(withQuery("/students", { includeArchived: true })).toBe(
      "/students?includeArchived=true",
    );
  });

  it("galat API menjadi ApiError dengan kode, pesan, dan galat per kolom", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "VALIDATION_ERROR",
              message: "Tidak valid",
              details: {
                issues: [{ path: "settings.dailyCloseTime", message: "Harus setelah jam masuk" }],
              },
            },
          }),
          { status: 400 },
        ),
    );
    const err = await api("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e).toMatchObject({ status: 400, code: "VALIDATION_ERROR", message: "Tidak valid" });
    // Awalan "settings." dibuang supaya cocok dengan nama input.
    expect(e.fieldErrors).toEqual({ dailyCloseTime: "Harus setelah jam masuk" });
  });

  it("jaringan putus menjadi galat NETWORK dengan pesan yang bisa ditindaklanjuti", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const e = (await api("/x").catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe("NETWORK");
    expect(e.message).toBe(t("common.networkError"));
  });

  it("401 memicu satu refresh lalu mengulang permintaan; refresh serentak digabung", async () => {
    let protectedCalls = 0;
    let refreshCalls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url === "/api/auth/refresh") {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return new Response("{}", { status: 200 });
      }
      protectedCalls++;
      return protectedCalls <= 2
        ? new Response("{}", { status: 401 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const [a, b] = await Promise.all([
      api<{ ok: boolean }>("/data"),
      api<{ ok: boolean }>("/data"),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(refreshCalls).toBe(1); // token refresh dirotasi: dua refresh serentak akan dianggap pemakaian ulang
  });

  it("401 pada endpoint /auth tidak memicu refresh (mencegah putaran tak berujung)", async () => {
    let refreshCalls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url === "/api/auth/refresh") refreshCalls++;
      return new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "x" } }), {
        status: 401,
      });
    });
    await expect(api("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(0);
  });

  it("204 mengembalikan undefined tanpa mengurai isi", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }));
    await expect(api("/x", { method: "DELETE" })).resolves.toBeUndefined();
  });
});

describe("terjemahan", () => {
  it("t mengganti variabel dan mengembalikan kunci bila tidak ada", () => {
    expect(t("table.rows", { count: 3 })).toBe("3 baris");
    expect(td("kunci.tidak.ada")).toBe("kunci.tidak.ada");
  });

  it("SETIAP teks yang dipakai konfigurasi data master tersedia di id.json", () => {
    const resources = buildResources();
    expect(Object.keys(resources).sort()).toEqual([...RESOURCE_ORDER].sort());
    const missing: string[] = [];
    const need = (key: string) => {
      if (td(key) === key) missing.push(key);
    };
    for (const def of Object.values(resources)) {
      need(`resources.${def.key}.title`);
      need(`resources.${def.key}.singular`);
      need(`resources.${def.key}.description`);
      for (const f of def.fields) need(`resources.${def.key}.fields.${f.name}`);
      for (const c of def.columns) {
        expect(c.header, `${def.key}.${c.key}`).not.toMatch(/^resources\./);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("buildPayload: isian formulir menjadi muatan API", () => {
  const defs = buildResources();

  it("angka, jam, dan pilihan numerik dikonversi; teks dipangkas; kosong opsional dilewati", () => {
    const payload = buildPayload(
      defs.schedules!,
      {
        termId: "t1",
        classId: "c1",
        subjectId: "s1",
        teacherId: "g1",
        dayOfWeek: "1",
        startTime: "07:30",
        endTime: "08:15",
      },
      false,
    );
    expect(payload).toEqual({
      termId: "t1",
      classId: "c1",
      subjectId: "s1",
      teacherId: "g1",
      dayOfWeek: 1,
      startTime: 450,
      endTime: 495,
    });

    const student = buildPayload(
      defs.students!,
      { name: "  Budi  ", nis: "123", nisn: "", classId: "", enrollmentStartDate: "" },
      false,
    );
    expect(student).toEqual({ name: "Budi", nis: "123" });
  });

  it("saat mengubah: bidang createOnly dibuang dan kosong nullable dikirim sebagai null", () => {
    const edit = buildPayload(
      defs.students!,
      { name: "Budi", nis: "123", nisn: "", status: "ACTIVE" },
      true,
    );
    expect(edit).toEqual({ name: "Budi", nis: "123", nisn: null, status: "ACTIVE" });
    expect("classId" in edit).toBe(false);

    const klass = buildPayload(
      defs.classes!,
      { name: "7A", grade: "7", homeroomTeacherId: "" },
      true,
    );
    expect(klass).toEqual({ name: "7A", grade: 7, homeroomTeacherId: null });
  });

  it("bidang bersyarat hanya dikirim bila syaratnya terpenuhi (libur per tingkat vs per kelas)", () => {
    const base = { name: "Libur", dateFrom: "2030-01-01", dateTo: "2030-01-02" };
    expect(
      buildPayload(defs.holidays!, { ...base, scope: "ALL", grade: "9", classId: "x" }, false),
    ).toEqual({ ...base, scope: "ALL" });
    expect(
      buildPayload(defs.holidays!, { ...base, scope: "GRADE", grade: "9", classId: "x" }, false),
    ).toEqual({ ...base, scope: "GRADE", grade: 9 });
    expect(
      buildPayload(defs.holidays!, { ...base, scope: "CLASS", grade: "9", classId: "x" }, false),
    ).toEqual({ ...base, scope: "CLASS", classId: "x" });
  });

  it("kotak centang selalu dikirim sebagai boolean, termasuk false", () => {
    expect(
      buildPayload(
        defs.geofences!,
        { name: "G", lat: "-6.2", lng: "106.8", radiusM: "150", isActive: false },
        false,
      ),
    ).toEqual({
      name: "G",
      lat: -6.2,
      lng: 106.8,
      radiusM: 150,
      isActive: false,
    });
  });

  it("jam yang tidak valid tidak dikirim (server yang menjelaskan galat kolomnya)", () => {
    const p = buildPayload(
      defs.schedules!,
      {
        termId: "t",
        classId: "c",
        subjectId: "s",
        teacherId: "g",
        dayOfWeek: "1",
        startTime: "bukan jam",
        endTime: "08:15",
      },
      false,
    );
    expect("startTime" in p).toBe(false);
    expect(p.endTime).toBe(495);
  });
});
