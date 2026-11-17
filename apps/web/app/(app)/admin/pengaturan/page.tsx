"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { SettingsDto } from "@hadirin/shared";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { SkeletonRows } from "../../../../components/ui/skeleton";
import { ErrorState } from "../../../../components/ui/state-panels";
import { useToast } from "../../../../components/ui/toast";
import { api, ApiError } from "../../../../lib/api";
import { DAY_NAMES, minutesToTime, timeToMinutes } from "../../../../lib/format";
import { td, t } from "../../../../lib/i18n";

type Settings = SettingsDto["settings"];

const MODES = ["DAILY_ONLY", "SUBJECT_ONLY", "BOTH"] as const;
const RULES = ["EXCLUDE_EXCUSED", "INCLUDE_EXCUSED"] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-line pt-6">
      <legend className="text-h2">{title}</legend>
      {children}
    </fieldset>
  );
}

export default function SettingsPage() {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<SettingsDto>("/settings/school"),
  });
  const [school, setSchool] = useState<SettingsDto["school"] | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!query.data) return;
    setSchool(query.data.school);
    setS(query.data.settings);
    const st = query.data.settings;
    setTimes({
      dailyStartTime: minutesToTime(st.dailyStartTime),
      dailyCloseTime: minutesToTime(st.dailyCloseTime),
      notifyQuietStart: minutesToTime(st.notifyQuietStart),
      notifyQuietEnd: minutesToTime(st.notifyQuietEnd),
      subjectDigestTime: minutesToTime(st.subjectDigestTime),
    });
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => {
      const merged: Settings = { ...s! };
      for (const [k, v] of Object.entries(times)) {
        const m = timeToMinutes(v);
        if (m !== null) (merged as Record<string, unknown>)[k] = m;
      }
      return api<SettingsDto>("/settings/school", {
        method: "PUT",
        body: { school, settings: merged },
      });
    },
    onSuccess: (res) => {
      setErrors({});
      client.setQueryData(["settings"], res);
      toast.show(t("common.saved"));
    },
    onError: (e) => {
      if (e instanceof ApiError)
        setErrors(Object.keys(e.fieldErrors).length ? e.fieldErrors : { form: e.message });
      else setErrors({ form: t("common.genericError") });
    },
  });

  if (query.isLoading || !school || !s)
    return query.isError ? (
      <ErrorState onRetry={() => void query.refetch()} />
    ) : (
      <SkeletonRows rows={6} />
    );
  const readOnly = query.data?.readOnly ?? true;

  const num = (name: keyof Settings) => (
    <Input
      key={name}
      label={td(`settings.${name}`)}
      type="number"
      value={String(s[name] ?? "")}
      disabled={readOnly}
      onChange={(e) => setS({ ...s, [name]: Number(e.target.value) })}
      error={errors[name]}
    />
  );
  const time = (name: string) => (
    <Input
      key={name}
      label={td(`settings.${name}`)}
      type="time"
      value={times[name] ?? ""}
      disabled={readOnly}
      onChange={(e) => setTimes({ ...times, [name]: e.target.value })}
      error={errors[name]}
    />
  );
  const bool = (name: keyof Settings) => (
    <label key={name} className="flex min-h-11 items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="size-5 accent-primary"
        checked={Boolean(s[name])}
        disabled={readOnly}
        onChange={(e) => setS({ ...s, [name]: e.target.checked })}
      />
      {td(`settings.${name}`)}
    </label>
  );

  function toggle<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex max-w-2xl flex-col gap-6"
      noValidate
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">{t("settings.title")}</h1>
        {readOnly ? (
          <p className="text-body text-ink-2">{t("settings.readOnlyNote")}</p>
        ) : (
          <p className="text-body text-ink-2">{t("settings.saveHint")}</p>
        )}
      </header>

      <Section title={t("settings.sectionSchool")}>
        <Input
          label={t("settings.name")}
          value={school.name}
          disabled={readOnly}
          onChange={(e) => setSchool({ ...school, name: e.target.value })}
          error={errors.name}
        />
        <Input
          label={t("settings.npsn")}
          value={school.npsn ?? ""}
          disabled={readOnly}
          onChange={(e) => setSchool({ ...school, npsn: e.target.value || null })}
          error={errors.npsn}
        />
        <Input
          label={t("settings.address")}
          value={school.address ?? ""}
          disabled={readOnly}
          onChange={(e) => setSchool({ ...school, address: e.target.value || null })}
          error={errors.address}
        />
        <Input
          label={t("settings.timezone")}
          hint={t("settings.timezoneHint")}
          value={school.timezone}
          disabled={readOnly}
          onChange={(e) => setSchool({ ...school, timezone: e.target.value })}
          error={errors.timezone}
        />
      </Section>

      <Section title={t("settings.sectionAttendance")}>
        <div className="flex flex-col gap-1">
          <label htmlFor="mode" className="text-sm">
            {t("settings.attendanceMode")}
          </label>
          <select
            id="mode"
            value={s.attendanceMode}
            disabled={readOnly}
            onChange={(e) =>
              setS({ ...s, attendanceMode: e.target.value as Settings["attendanceMode"] })
            }
            className="h-11 rounded-sm border border-line-strong bg-surface px-3 text-base"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {td(`settings.mode${m}`)}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="flex flex-col">
          <legend className="text-sm">{t("settings.checkinModes")}</legend>
          {(["QR", "QUICK"] as const).map((m) => (
            <label key={m} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={s.checkinModes.includes(m)}
                disabled={readOnly}
                onChange={() => setS({ ...s, checkinModes: toggle([...s.checkinModes], m) })}
              />
              {td(`settings.checkin${m}`)}
            </label>
          ))}
          <p aria-live="polite" className="text-caption text-status-absent-fg">
            {errors.checkinModes}
          </p>
        </fieldset>
        <fieldset className="flex flex-col">
          <legend className="text-sm">{t("settings.schoolDays")}</legend>
          <div className="flex flex-wrap gap-x-4">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <label key={d} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={s.schoolDays.includes(d)}
                  disabled={readOnly}
                  onChange={() => setS({ ...s, schoolDays: toggle([...s.schoolDays], d).sort() })}
                />
                {DAY_NAMES[d]}
              </label>
            ))}
          </div>
          <p aria-live="polite" className="text-caption text-status-absent-fg">
            {errors.schoolDays}
          </p>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          {time("dailyStartTime")}
          {time("dailyCloseTime")}
        </div>
      </Section>

      <Section title={t("settings.sectionLate")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {num("defaultLateAfterMinutes")}
          {num("lateAfterOpenGraceMinutes")}
          {num("adhocSessionMinutes")}
        </div>
      </Section>

      <Section title={t("settings.sectionLocation")}>
        {bool("geofenceEnabled")}
        {num("locationAccuracyMaxM")}
        {bool("deviceBindingEnabled")}
        {num("deviceSelfRebindDays")}
      </Section>

      <Section title={t("settings.sectionRecap")}>
        <div className="flex flex-col gap-1">
          <label htmlFor="rule" className="text-sm">
            {t("settings.percentageRule")}
          </label>
          <select
            id="rule"
            value={s.percentageRule}
            disabled={readOnly}
            onChange={(e) =>
              setS({ ...s, percentageRule: e.target.value as Settings["percentageRule"] })
            }
            className="h-11 rounded-sm border border-line-strong bg-surface px-3 text-base"
          >
            {RULES.map((r) => (
              <option key={r} value={r}>
                {td(`settings.rule${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {num("backfillDays")}
          {num("retentionYears")}
        </div>
      </Section>

      <Section title={t("settings.sectionNotify")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {time("notifyQuietStart")}
          {time("notifyQuietEnd")}
          {time("subjectDigestTime")}
        </div>
      </Section>

      {errors.form ? (
        <p role="alert" className="text-sm text-status-absent-fg">
          {errors.form}
        </p>
      ) : null}
      {readOnly ? null : (
        <div>
          <Button type="submit" loading={save.isPending}>
            {t("common.save")}
          </Button>
        </div>
      )}
    </form>
  );
}
