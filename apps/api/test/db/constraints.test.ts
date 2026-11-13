import { describe, expect, it } from "vitest";
import {
  D,
  expectDbRejects,
  makeAttendance,
  makeDevice,
  makeSession,
  makeStudent,
  makeWorld,
  newId,
  prisma,
  unique,
} from "../helpers/db";
import { openEnrollmentKey } from "../../src/infra/db/keys";

// Tes yang SENGAJA melanggar constraint: database sendiri harus menolak (AGENTS.md §7, rencana 1.8).

describe("UNIQUE", () => {
  it("attendances (session_id, student_id): satu baris per siswa per sesi", async () => {
    const w = await makeWorld();
    const s = await makeSession(w);
    await makeAttendance(w, s.id, w.studentId);
    await expectDbRejects(
      makeAttendance(w, s.id, w.studentId),
      /Unique constraint|attendances_session_id_student_id_key|Duplicate/i,
    );
  });

  it("schedule_slot_key: satu sesi mapel per jadwal per tanggal", async () => {
    const w = await makeWorld();
    await makeSession(w, { sessionDate: "2026-10-05" });
    await expectDbRejects(
      makeSession(w, { sessionDate: "2026-10-05" }),
      /Unique constraint|schedule_slot_key|Duplicate/i,
    );
  });

  it("schedule_slot_key: tanggal lain atau sesi dibatalkan membebaskan slot", async () => {
    const w = await makeWorld();
    await makeSession(w, { sessionDate: "2026-10-05" });
    await expect(makeSession(w, { sessionDate: "2026-10-12" })).resolves.toBeDefined();
    const cancelled = await makeSession(w, { sessionDate: "2026-10-19", status: "CANCELLED" });
    expect(cancelled.scheduleSlotKey).toBeNull();
    await expect(makeSession(w, { sessionDate: "2026-10-19" })).resolves.toBeDefined();
  });

  it("daily_slot_key: satu sesi DAILY per kelas per tanggal", async () => {
    const w = await makeWorld();
    await makeSession(w, { type: "DAILY", sessionDate: "2026-10-05" });
    await expectDbRejects(
      makeSession(w, { type: "DAILY", sessionDate: "2026-10-05" }),
      /Unique constraint|daily_slot_key|Duplicate/i,
    );
    // Sesi mapel di kelas dan tanggal yang sama tidak terkena aturan sesi harian.
    await expect(
      makeSession(w, { type: "SUBJECT", sessionDate: "2026-10-05" }),
    ).resolves.toBeDefined();
  });

  it("active_student_key: satu perangkat ACTIVE per siswa, REVOKED boleh banyak", async () => {
    const w = await makeWorld();
    await makeDevice(w.studentId, "ACTIVE");
    await expectDbRejects(
      makeDevice(w.studentId, "ACTIVE"),
      /Unique constraint|active_student_key|Duplicate/i,
    );
    await expect(makeDevice(w.studentId, "REVOKED")).resolves.toBeDefined();
    await expect(makeDevice(w.studentId, "REVOKED")).resolves.toBeDefined();
    await expect(makeDevice(w.studentId, "PENDING")).resolves.toBeDefined();
  });

  it("open_enrollment_key: satu pendaftaran terbuka per siswa per tahun ajaran", async () => {
    const w = await makeWorld(); // sudah punya satu pendaftaran terbuka
    const key = openEnrollmentKey({
      studentId: w.studentId,
      academicYearId: w.yearId,
      endDate: null,
    });
    await expectDbRejects(
      prisma.classEnrollment.create({
        data: {
          studentId: w.studentId,
          classId: w.classId,
          academicYearId: w.yearId,
          startDate: D("2026-08-01"),
          openEnrollmentKey: key,
        },
      }),
      /Unique constraint|open_enrollment_key|Duplicate/i,
    );
  });

  it("notifications.dedupe_key", async () => {
    const w = await makeWorld();
    const make = () =>
      prisma.notification.create({
        data: {
          schoolId: w.schoolId,
          channel: "WHATSAPP",
          templateKey: "ABSENT",
          dedupeKey: `ABSENT:${w.studentId}:2026-10-05`,
          payload: {},
          scheduledAt: new Date(),
        },
      });
    await make();
    await expectDbRejects(make(), /Unique constraint|dedupe_key|Duplicate/i);
  });

  it("jobs.dedupe_key, dan banyak job tanpa dedupe_key tetap boleh", async () => {
    const key = `job-${unique()}`;
    const make = (dedupeKey: string | null) =>
      prisma.job.create({ data: { queue: "uji", payload: {}, dedupeKey, runAt: new Date() } });
    await make(key);
    await expectDbRejects(make(key), /Unique constraint|dedupe_key|Duplicate/i);
    await make(null);
    await expect(make(null)).resolves.toBeDefined();
  });

  it("idempotency_keys (scope, key)", async () => {
    const key = `k-${unique()}`;
    const make = () =>
      prisma.idempotencyKey.create({
        data: {
          scope: "user-1",
          key,
          requestHash: "x",
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        },
      });
    await make();
    await expectDbRejects(make(), /Unique constraint|Duplicate/i);
  });

  it("students.nis, users (school_id, login_id), users.email, parents.phone_wa", async () => {
    const w = await makeWorld();
    const student = await prisma.student.findUniqueOrThrow({ where: { id: w.studentId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: w.studentUserId } });
    const teacherUser = await prisma.user.findUniqueOrThrow({ where: { id: w.teacherUserId } });

    const u2 = await prisma.user.create({
      data: { schoolId: w.schoolId, role: "STUDENT", name: "Lain", loginId: unique().slice(0, 40) },
    });
    await expectDbRejects(
      prisma.student.create({ data: { userId: u2.id, nis: student.nis } }),
      /Unique constraint|nis|Duplicate/i,
    );
    await expectDbRejects(
      prisma.user.create({
        data: { schoolId: w.schoolId, role: "STUDENT", name: "Kembar", loginId: user.loginId },
      }),
      /Unique constraint|login_id|Duplicate/i,
    );
    await expectDbRejects(
      prisma.user.create({
        data: { schoolId: w.schoolId, role: "TEACHER", name: "Kembar", email: teacherUser.email },
      }),
      /Unique constraint|email|Duplicate/i,
    );
    const phone = `+62800${Math.floor(Math.random() * 1e7)}`;
    const p1 = await prisma.user.create({
      data: { schoolId: w.schoolId, role: "PARENT", name: "Ortu 1" },
    });
    const p2 = await prisma.user.create({
      data: { schoolId: w.schoolId, role: "PARENT", name: "Ortu 2" },
    });
    await prisma.parent.create({ data: { userId: p1.id, phoneWa: phone } });
    await expectDbRejects(
      prisma.parent.create({ data: { userId: p2.id, phoneWa: phone } }),
      /Unique constraint|phone_wa|Duplicate/i,
    );
  });

  it("terms (academic_year_id, semester), student_parents, daily_statuses (student_id, date)", async () => {
    const w = await makeWorld();
    await expectDbRejects(
      prisma.term.create({
        data: {
          academicYearId: w.yearId,
          semester: 1,
          startDate: D("2027-01-04"),
          endDate: D("2027-06-26"),
        },
      }),
      /Unique constraint|Duplicate/i,
    );
    const pu = await prisma.user.create({
      data: { schoolId: w.schoolId, role: "PARENT", name: "Ortu" },
    });
    const parent = await prisma.parent.create({
      data: { userId: pu.id, phoneWa: `+62800${Math.floor(Math.random() * 1e7)}` },
    });
    await prisma.studentParent.create({
      data: { studentId: w.studentId, parentId: parent.id, relation: "Ibu" },
    });
    await expectDbRejects(
      prisma.studentParent.create({
        data: { studentId: w.studentId, parentId: parent.id, relation: "Ibu" },
      }),
      /Unique constraint|Duplicate/i,
    );
    const ds = () =>
      prisma.dailyStatus.create({
        data: {
          studentId: w.studentId,
          classId: w.classId,
          date: D("2026-10-05"),
          status: "PRESENT",
          source: "DAILY_SESSION",
          computedAt: new Date(),
        },
      });
    await ds();
    await expectDbRejects(ds(), /Unique constraint|Duplicate/i);
  });
});

describe("CHECK kolom kunci (harus selalu konsisten dengan kolom asalnya)", () => {
  it("schedule_slot_key yang tidak cocok dengan jadwal/tanggal ditolak", async () => {
    const w = await makeWorld();
    const base = await makeSession(w);
    await prisma.attendanceSession.delete({ where: { id: base.id } });
    const bad = (key: string | null) =>
      prisma.attendanceSession.create({
        data: {
          schoolId: w.schoolId,
          classId: w.classId,
          termId: w.termId,
          scheduleId: w.scheduleId,
          subjectId: w.subjectId,
          type: "SUBJECT",
          sessionDate: D("2026-10-05"),
          startsAt: new Date(),
          lateAfterMinutes: 10,
          lateThresholdAt: new Date(),
          openedAt: new Date("2026-10-05T00:00:00.000Z"),
          openedById: w.teacherUserId,
          closesAt: new Date("2026-10-05T01:00:00.000Z"),
          qrSecretEnc: "uji",
          scheduleSlotKey: key,
        },
      });
    await expectDbRejects(bad(null), /chk_sessions_schedule_slot_key|CONSTRAINT/i);
    await expectDbRejects(
      bad(`${newId()}|2026-10-05`),
      /chk_sessions_schedule_slot_key|CONSTRAINT/i,
    );
  });

  it("daily_slot_key terisi pada sesi SUBJECT atau tidak terisi pada sesi DAILY ditolak", async () => {
    const w = await makeWorld();
    const make = (type: "DAILY" | "SUBJECT", dailyKey: string | null) =>
      prisma.attendanceSession.create({
        data: {
          schoolId: w.schoolId,
          classId: w.classId,
          termId: w.termId,
          type,
          sessionDate: D("2026-10-06"),
          startsAt: new Date(),
          lateAfterMinutes: 10,
          lateThresholdAt: new Date(),
          openedAt: new Date("2026-10-06T00:00:00.000Z"),
          openedById: w.teacherUserId,
          closesAt: new Date("2026-10-06T01:00:00.000Z"),
          qrSecretEnc: "uji",
          dailySlotKey: dailyKey,
        },
      });
    await expectDbRejects(make("DAILY", null), /chk_sessions_daily_slot_key|CONSTRAINT/i);
    await expectDbRejects(
      make("SUBJECT", `${w.classId}|2026-10-06`),
      /chk_sessions_daily_slot_key|CONSTRAINT/i,
    );
  });

  it("active_student_key harus sama dengan student_id hanya saat ACTIVE", async () => {
    const w = await makeWorld();
    await expectDbRejects(
      makeDevice(w.studentId, "ACTIVE", null),
      /chk_devices_active_student_key|CONSTRAINT/i,
    );
    await expectDbRejects(
      makeDevice(w.studentId, "REVOKED", w.studentId),
      /chk_devices_active_student_key|CONSTRAINT/i,
    );
    await expectDbRejects(
      makeDevice(w.studentId, "ACTIVE", newId()),
      /chk_devices_active_student_key|CONSTRAINT/i,
    );
  });

  it("open_enrollment_key harus terisi saat end_date NULL dan kosong saat end_date terisi", async () => {
    const w = await makeWorld();
    const sid = await makeStudent(w);
    const make = (endDate: string | null, key: string | null) =>
      prisma.classEnrollment.create({
        data: {
          studentId: sid,
          classId: w.classId,
          academicYearId: w.yearId,
          startDate: D("2026-08-01"),
          endDate: endDate ? D(endDate) : null,
          openEnrollmentKey: key,
        },
      });
    await expectDbRejects(make(null, null), /chk_enrollments_open_key|CONSTRAINT/i);
    await expectDbRejects(
      make("2026-09-01", `${sid}|${w.yearId}`),
      /chk_enrollments_open_key|CONSTRAINT/i,
    );
    await expectDbRejects(
      make(null, `${newId()}|${w.yearId}`),
      /chk_enrollments_open_key|CONSTRAINT/i,
    );
  });
});

describe("CHECK nilai", () => {
  it("sesi: closes_at harus setelah opened_at, late_after_minutes tidak negatif", async () => {
    const w = await makeWorld();
    await expectDbRejects(
      makeSession(w, {
        sessionDate: "2026-10-07",
        openedAt: new Date("2026-10-07T02:00:00.000Z"),
        closesAt: new Date("2026-10-07T01:00:00.000Z"),
      }),
      /chk_sessions_closes_after_opened|CONSTRAINT/i,
    );
    await expectDbRejects(
      makeSession(w, { sessionDate: "2026-10-08", lateAfterMinutes: -1 }),
      /chk_sessions_late_after|CONSTRAINT/i,
    );
  });

  it("kehadiran: PRESENT/LATE wajib punya checked_in_at", async () => {
    const w = await makeWorld();
    const s = await makeSession(w);
    await expectDbRejects(
      makeAttendance(w, s.id, w.studentId, { status: "PRESENT", checkedInAt: null }),
      /chk_attendances_checked_in|CONSTRAINT/i,
    );
  });

  it("kehadiran: LATE jika dan hanya jika late_minutes > 0", async () => {
    const w = await makeWorld();
    const s = await makeSession(w);
    const s2 = await makeStudent(w);
    const s3 = await makeStudent(w);
    await expectDbRejects(
      makeAttendance(w, s.id, w.studentId, { status: "LATE", lateMinutes: 0 }),
      /chk_attendances_late_minutes|CONSTRAINT/i,
    );
    await expectDbRejects(
      makeAttendance(w, s.id, s2, { status: "PRESENT", lateMinutes: 3 }),
      /chk_attendances_late_minutes|CONSTRAINT/i,
    );
    await expectDbRejects(
      makeAttendance(w, s.id, s3, { status: "ABSENT", method: "AUTO", lateMinutes: -2 }),
      /chk_attendances_late_minutes|CONSTRAINT/i,
    );
  });

  it("kehadiran: jarak dan akurasi tidak negatif", async () => {
    const w = await makeWorld();
    const s = await makeSession(w);
    await expectDbRejects(
      prisma.attendance.create({
        data: {
          sessionId: s.id,
          studentId: w.studentId,
          classId: w.classId,
          sessionDate: D("2026-10-05"),
          sessionType: "SUBJECT",
          status: "ABSENT",
          method: "AUTO",
          distanceM: -5,
        },
      }),
      /chk_attendances_distance|CONSTRAINT/i,
    );
  });

  it("geofence: lat -90..90, lng -180..180, radius > 0", async () => {
    const w = await makeWorld();
    const make = (lat: string, lng: string, radiusM: number) =>
      prisma.geofence.create({ data: { schoolId: w.schoolId, name: "g", lat, lng, radiusM } });
    await expectDbRejects(make("91", "100", 100), /chk_geofences_lat|CONSTRAINT/i);
    await expectDbRejects(make("-91", "100", 100), /chk_geofences_lat|CONSTRAINT/i);
    await expectDbRejects(make("0", "181", 100), /chk_geofences_lng|CONSTRAINT/i);
    await expectDbRejects(make("0", "-181", 100), /chk_geofences_lng|CONSTRAINT/i);
    await expectDbRejects(make("0", "0", 0), /chk_geofences_radius|CONSTRAINT/i);
    await expect(make("-6.175", "106.827", 150)).resolves.toBeDefined();
  });

  it("pengaturan sekolah: jam dinding 0..1439 dan rentang angka", async () => {
    const w = await makeWorld();
    await expectDbRejects(
      prisma.schoolSetting.create({
        data: { schoolId: w.schoolId, checkinModes: ["QR"], schoolDays: [1], dailyStartTime: 1440 },
      }),
      /chk_settings_minutes|CONSTRAINT/i,
    );
    const w2 = await makeWorld();
    await expectDbRejects(
      prisma.schoolSetting.create({
        data: {
          schoolId: w2.schoolId,
          checkinModes: ["QR"],
          schoolDays: [1],
          adhocSessionMinutes: 241,
        },
      }),
      /chk_settings_ranges|CONSTRAINT/i,
    );
  });

  it("jadwal: hari 1..7, jam 0..1439, selesai setelah mulai", async () => {
    const w = await makeWorld();
    const make = (dayOfWeek: number, startTime: number, endTime: number) =>
      prisma.schedule.create({
        data: {
          termId: w.termId,
          classId: w.classId,
          subjectId: w.subjectId,
          teacherId: w.teacherId,
          dayOfWeek,
          startTime,
          endTime,
        },
      });
    await expectDbRejects(make(8, 450, 495), /chk_schedules_day|CONSTRAINT/i);
    await expectDbRejects(make(0, 450, 495), /chk_schedules_day|CONSTRAINT/i);
    await expectDbRejects(make(1, 500, 500), /chk_schedules_time|CONSTRAINT/i);
    await expectDbRejects(make(1, 500, 400), /chk_schedules_time|CONSTRAINT/i);
    await expectDbRejects(make(1, 450, 1440), /chk_schedules_time|CONSTRAINT/i);
  });

  it("tahun ajaran, semester, jabatan: tanggal akhir tidak sebelum awal, semester 1 atau 2", async () => {
    const w = await makeWorld();
    await expectDbRejects(
      prisma.academicYear.create({
        data: {
          schoolId: w.schoolId,
          name: "x",
          startDate: D("2027-01-01"),
          endDate: D("2026-01-01"),
        },
      }),
      /chk_years_dates|CONSTRAINT/i,
    );
    await expectDbRejects(
      prisma.term.create({
        data: {
          academicYearId: w.yearId,
          semester: 3,
          startDate: D("2027-01-04"),
          endDate: D("2027-06-26"),
        },
      }),
      /chk_terms_semester|CONSTRAINT/i,
    );
    await expectDbRejects(
      prisma.term.create({
        data: {
          academicYearId: w.yearId,
          semester: 2,
          startDate: D("2027-06-26"),
          endDate: D("2027-01-04"),
        },
      }),
      /chk_terms_dates|CONSTRAINT/i,
    );
    await expectDbRejects(
      prisma.staffPositionAssignment.create({
        data: {
          teacherId: w.teacherId,
          position: "PICKET",
          academicYearId: w.yearId,
          startsOn: D("2026-09-01"),
          endsOn: D("2026-08-01"),
        },
      }),
      /chk_positions_dates|CONSTRAINT/i,
    );
  });

  it("libur: date_to >= date_from; scope CLASS jika dan hanya jika class_id; scope GRADE jika dan hanya jika grade", async () => {
    const w = await makeWorld();
    const make = (data: {
      scope: "ALL" | "GRADE" | "CLASS";
      grade?: number;
      classId?: string;
      dateFrom?: string;
      dateTo?: string;
    }) =>
      prisma.holiday.create({
        data: {
          schoolId: w.schoolId,
          name: "h",
          dateFrom: D(data.dateFrom ?? "2026-10-05"),
          dateTo: D(data.dateTo ?? "2026-10-05"),
          scope: data.scope,
          grade: data.grade ?? null,
          classId: data.classId ?? null,
        },
      });
    await expectDbRejects(
      make({ scope: "ALL", dateFrom: "2026-10-06", dateTo: "2026-10-05" }),
      /chk_holidays_dates|CONSTRAINT/i,
    );
    await expectDbRejects(make({ scope: "CLASS" }), /chk_holidays_scope_class|CONSTRAINT/i);
    await expectDbRejects(
      make({ scope: "ALL", classId: w.classId }),
      /chk_holidays_scope_class|CONSTRAINT/i,
    );
    await expectDbRejects(make({ scope: "GRADE" }), /chk_holidays_scope_grade|CONSTRAINT/i);
    await expectDbRejects(make({ scope: "ALL", grade: 7 }), /chk_holidays_scope_grade|CONSTRAINT/i);
    await expect(make({ scope: "CLASS", classId: w.classId })).resolves.toBeDefined();
    await expect(make({ scope: "GRADE", grade: 7 })).resolves.toBeDefined();
  });

  it("pendaftaran: end_date tidak sebelum start_date", async () => {
    const w = await makeWorld();
    const sid = await makeStudent(w);
    await expectDbRejects(
      prisma.classEnrollment.create({
        data: {
          studentId: sid,
          classId: w.classId,
          academicYearId: w.yearId,
          startDate: D("2026-09-01"),
          endDate: D("2026-08-01"),
        },
      }),
      /chk_enrollments_dates|CONSTRAINT/i,
    );
  });

  it("pengajuan izin: date_to >= date_from, time_to > time_from, jam 0..1439", async () => {
    const w = await makeWorld();
    const make = (o: {
      dateFrom?: string;
      dateTo?: string;
      timeFrom?: number | null;
      timeTo?: number | null;
    }) =>
      prisma.leaveRequest.create({
        data: {
          studentId: w.studentId,
          requestedById: w.teacherUserId,
          requesterRole: "TEACHER",
          type: "SICK",
          reason: "uji",
          dateFrom: D(o.dateFrom ?? "2026-10-05"),
          dateTo: D(o.dateTo ?? "2026-10-05"),
          timeFrom: o.timeFrom ?? null,
          timeTo: o.timeTo ?? null,
        },
      });
    await expectDbRejects(
      make({ dateFrom: "2026-10-06", dateTo: "2026-10-05" }),
      /chk_leave_dates|CONSTRAINT/i,
    );
    await expectDbRejects(make({ timeFrom: 600, timeTo: 600 }), /chk_leave_times|CONSTRAINT/i);
    await expectDbRejects(make({ timeFrom: 600, timeTo: 500 }), /chk_leave_times|CONSTRAINT/i);
    await expectDbRejects(make({ timeFrom: 1440 }), /chk_leave_times|CONSTRAINT/i);
    await expect(make({ timeFrom: 600, timeTo: 700 })).resolves.toBeDefined();
    await expect(make({})).resolves.toBeDefined();
  });

  it("lampiran dan infrastruktur: ukuran > 0, attempts >= 0, max_attempts >= 1", async () => {
    const w = await makeWorld();
    const lr = await prisma.leaveRequest.create({
      data: {
        studentId: w.studentId,
        requestedById: w.teacherUserId,
        requesterRole: "TEACHER",
        type: "SICK",
        reason: "uji",
        dateFrom: D("2026-10-05"),
        dateTo: D("2026-10-05"),
      },
    });
    await expectDbRejects(
      prisma.leaveAttachment.create({
        data: { leaveRequestId: lr.id, storageKey: "k", mimeType: "image/png", sizeBytes: 0 },
      }),
      /chk_leave_attachments_size|CONSTRAINT/i,
    );
    await expectDbRejects(
      prisma.job.create({ data: { queue: "q", payload: {}, runAt: new Date(), attempts: -1 } }),
      /chk_jobs_attempts|CONSTRAINT/i,
    );
    await expectDbRejects(
      prisma.job.create({ data: { queue: "q", payload: {}, runAt: new Date(), maxAttempts: 0 } }),
      /chk_jobs_attempts|CONSTRAINT/i,
    );
  });
});

describe("trigger jejak (tidak ada jalur untuk menghapus kehadiran atau mengubah jejak)", () => {
  it("attendances tidak bisa dihapus, lewat Prisma maupun SQL mentah", async () => {
    const w = await makeWorld();
    const s = await makeSession(w);
    const a = await makeAttendance(w, s.id, w.studentId);
    await expectDbRejects(
      prisma.attendance.delete({ where: { id: a.id } }),
      /tidak boleh dihapus|45000/i,
    );
    await expectDbRejects(
      prisma.$executeRaw`DELETE FROM attendances WHERE id = ${a.id}`,
      /tidak boleh dihapus|45000/i,
    );
    await expectDbRejects(
      prisma.attendance.deleteMany({ where: { sessionId: s.id } }),
      /tidak boleh dihapus|45000/i,
    );
    expect(await prisma.attendance.count({ where: { id: a.id } })).toBe(1);
  });

  it("attendance_audits hanya boleh ditambah", async () => {
    const w = await makeWorld();
    const s = await makeSession(w);
    const a = await makeAttendance(w, s.id, w.studentId, { status: "ABSENT", method: "AUTO" });
    const audit = await prisma.attendanceAudit.create({
      data: {
        attendanceId: a.id,
        actorType: "SYSTEM",
        oldStatus: "ABSENT",
        newStatus: "SICK",
        oldMethod: "AUTO",
        newMethod: "LEAVE",
        source: "LEAVE_APPROVAL",
        changedAt: new Date(),
      },
    });
    await expectDbRejects(
      prisma.attendanceAudit.update({ where: { id: audit.id }, data: { reason: "diubah" } }),
      /hanya boleh ditambah|45000/i,
    );
    await expectDbRejects(
      prisma.attendanceAudit.delete({ where: { id: audit.id } }),
      /hanya boleh ditambah|45000/i,
    );
    await expectDbRejects(
      prisma.$executeRaw`UPDATE attendance_audits SET new_status = 'PRESENT' WHERE id = ${audit.id}`,
      /hanya boleh ditambah|45000/i,
    );
  });

  it("audit_logs hanya boleh ditambah", async () => {
    const w = await makeWorld();
    const log = await prisma.auditLog.create({
      data: { schoolId: w.schoolId, actorId: w.teacherUserId, action: "uji", entity: "uji" },
    });
    await expectDbRejects(
      prisma.auditLog.update({ where: { id: log.id }, data: { action: "diubah" } }),
      /hanya boleh ditambah|45000/i,
    );
    await expectDbRejects(
      prisma.auditLog.delete({ where: { id: log.id } }),
      /hanya boleh ditambah|45000/i,
    );
  });
});

describe("kunci asing RESTRICT pada jalur ke data kehadiran", () => {
  it("sesi, siswa, kelas, dan pengguna yang dipakai kehadiran tidak bisa dihapus", async () => {
    const w = await makeWorld();
    const s = await makeSession(w);
    await makeAttendance(w, s.id, w.studentId);
    await expectDbRejects(
      prisma.attendanceSession.delete({ where: { id: s.id } }),
      /Foreign key constraint|foreign key/i,
    );
    await expectDbRejects(
      prisma.student.delete({ where: { id: w.studentId } }),
      /Foreign key constraint|foreign key/i,
    );
    await expectDbRejects(
      prisma.class.delete({ where: { id: w.classId } }),
      /Foreign key constraint|foreign key/i,
    );
    await expectDbRejects(
      prisma.user.delete({ where: { id: w.teacherUserId } }),
      /Foreign key constraint|foreign key/i,
    );
    await expectDbRejects(
      prisma.schedule.delete({ where: { id: w.scheduleId } }),
      /Foreign key constraint|foreign key/i,
    );
  });

  it("ON UPDATE RESTRICT: id yang dirujuk tidak bisa diganti", async () => {
    const w = await makeWorld();
    const s = await makeSession(w);
    await makeAttendance(w, s.id, w.studentId);
    await expectDbRejects(
      prisma.attendanceSession.update({ where: { id: s.id }, data: { id: newId() } }),
      /Foreign key constraint|foreign key/i,
    );
    expect((await prisma.attendanceSession.findUnique({ where: { id: s.id } }))?.id).toBe(s.id);
  });

  it("semua kunci asing di skema memakai RESTRICT (periksa information_schema)", async () => {
    const rows = await prisma.$queryRaw<Array<{ del: string; upd: string; n: bigint }>>`
      SELECT delete_rule AS del, update_rule AS upd, COUNT(*) AS n
      FROM information_schema.referential_constraints
      WHERE constraint_schema = DATABASE()
      GROUP BY delete_rule, update_rule`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ del: "RESTRICT", upd: "RESTRICT" });
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(60);
  });
});

describe("konkurensi di tingkat database", () => {
  it("banyak sisipan paralel untuk siswa yang sama menghasilkan tepat satu baris", async () => {
    const w = await makeWorld();
    const s = await makeSession(w);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => makeAttendance(w, s.id, w.studentId)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.attendance.count({ where: { sessionId: s.id, studentId: w.studentId } }),
    ).toBe(1);
  });

  it("banyak sisipan paralel untuk siswa berbeda semuanya sukses", async () => {
    const w = await makeWorld();
    const s = await makeSession(w);
    const ids = await Promise.all(Array.from({ length: 20 }, () => makeStudent(w)));
    const results = await Promise.allSettled(ids.map((id) => makeAttendance(w, s.id, id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
  });

  it("pembukaan sesi harian paralel untuk kelas dan tanggal yang sama hanya menghasilkan satu sesi", async () => {
    const w = await makeWorld();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        makeSession(w, { type: "DAILY", sessionDate: "2026-10-09" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});
