"use client";

import { useState, type FormEvent } from "react";
import { td, t } from "../../lib/i18n";
import { minutesToTime } from "../../lib/format";
import { buildPayload } from "../../lib/payload";
import type { FieldDef, ResourceDef, Row } from "../../lib/resources";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { RefPicker } from "./ref-picker";

type Values = Record<string, string | boolean>;
type Labels = Record<string, string | null>;

const fieldLabel = (resource: string, f: FieldDef) => td(`resources.${resource}.fields.${f.name}`);

function initialValues(def: ResourceDef, row: Row | null): { values: Values; labels: Labels } {
  const values: Values = {};
  const labels: Labels = {};
  for (const f of def.fields) {
    if (row && f.createOnly) continue;
    if (!row && f.editOnly) continue;
    const raw = row ? row[f.name] : undefined;
    if (f.kind === "checkbox")
      values[f.name] = row
        ? Boolean(raw)
        : f.name === "isActive" || f.name === "receivesNotifications";
    else if (f.kind === "time") values[f.name] = typeof raw === "number" ? minutesToTime(raw) : "";
    else if (f.kind === "ref") {
      values[f.name] = raw === null || raw === undefined ? "" : String(raw);
      labels[f.name] = row && f.initialLabel ? f.initialLabel(row) : null;
    } else values[f.name] = raw === null || raw === undefined ? "" : String(raw);
  }
  return { values, labels };
}

/** Formulir panel samping untuk satu sumber data master. */
export function ResourceForm({
  def,
  row,
  busy,
  errors,
  onSubmit,
  onCancel,
}: {
  def: ResourceDef;
  row: Row | null;
  busy: boolean;
  errors: Record<string, string>;
  onSubmit: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const editing = row !== null;
  const init = initialValues(def, row);
  const [values, setValues] = useState<Values>(init.values);
  const [labels, setLabels] = useState<Labels>(init.labels);
  const [missing, setMissing] = useState<Record<string, string>>({});

  const visible = def.fields.filter(
    (f) =>
      !(editing && f.createOnly) &&
      !(!editing && f.editOnly) &&
      (!f.showWhen || f.showWhen(values)),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const gaps: Record<string, string> = {};
    for (const f of visible) {
      if (f.required && f.kind !== "checkbox" && !String(values[f.name] ?? "").trim())
        gaps[f.name] = t("common.required");
    }
    setMissing(gaps);
    if (Object.keys(gaps).length === 0) onSubmit(buildPayload(def, values, editing));
  }

  const setValue = (name: string, v: string | boolean) =>
    setValues((cur) => ({ ...cur, [name]: v }));
  const err = (name: string) => errors[name] ?? missing[name];

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      {visible.map((f) => {
        const label = fieldLabel(def.key, f);
        if (f.kind === "checkbox") {
          return (
            <label key={f.name} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={Boolean(values[f.name])}
                onChange={(e) => setValue(f.name, e.target.checked)}
              />
              {label}
            </label>
          );
        }
        if (f.kind === "ref" && f.ref) {
          return (
            <RefPicker
              key={f.name}
              source={f.ref}
              label={label}
              required={f.required}
              value={String(values[f.name] ?? "") || null}
              valueLabel={labels[f.name] ?? null}
              error={err(f.name)}
              onChange={(id, l) => {
                setValue(f.name, id ?? "");
                setLabels((cur) => ({ ...cur, [f.name]: l }));
              }}
            />
          );
        }
        if (f.kind === "select") {
          return (
            <div key={f.name} className="flex flex-col gap-1">
              <label htmlFor={`f-${f.name}`} className="text-sm">
                {label}
              </label>
              <select
                id={`f-${f.name}`}
                value={String(values[f.name] ?? "")}
                onChange={(e) => setValue(f.name, e.target.value)}
                aria-invalid={err(f.name) ? true : undefined}
                className="h-11 rounded-sm border border-line-strong bg-surface px-3 text-base"
              >
                <option value="">{t("common.choose")}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p aria-live="polite" className="text-caption text-status-absent-fg">
                {err(f.name)}
              </p>
            </div>
          );
        }
        return (
          <Input
            key={f.name}
            label={label}
            name={f.name}
            type={
              f.kind === "number"
                ? "number"
                : f.kind === "date"
                  ? "date"
                  : f.kind === "time"
                    ? "time"
                    : "text"
            }
            step={f.step}
            inputMode={f.kind === "number" ? "decimal" : undefined}
            maxLength={f.maxLength}
            value={String(values[f.name] ?? "")}
            onChange={(e) => setValue(f.name, e.target.value)}
            error={err(f.name)}
            required={f.required}
          />
        );
      })}
      {errors.form ? (
        <p role="alert" className="text-sm text-status-absent-fg">
          {errors.form}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
