import { timeToMinutes } from "./format";
import type { ResourceDef } from "./resources";

export type FormValues = Record<string, string | boolean>;

/** Mengubah isian formulir menjadi muatan API. Hanya bentuk data; kebenarannya diperiksa server. */
export function buildPayload(
  def: ResourceDef,
  values: FormValues,
  editing: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (editing && f.createOnly) continue;
    if (!editing && f.editOnly) continue;
    if (f.showWhen && !f.showWhen(values)) continue;
    const v = values[f.name];
    if (f.kind === "checkbox") {
      out[f.name] = Boolean(v);
      continue;
    }
    const s = typeof v === "string" ? v.trim() : "";
    if (s === "") {
      if (f.nullable && editing) out[f.name] = null;
      continue;
    }
    if (f.kind === "number" || (f.kind === "select" && f.numeric)) out[f.name] = Number(s);
    else if (f.kind === "time") {
      const m = timeToMinutes(s);
      if (m !== null) out[f.name] = m;
    } else out[f.name] = s;
  }
  return out;
}
