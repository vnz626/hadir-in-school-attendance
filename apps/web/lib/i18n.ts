import messages from "../messages/id.json";

type Messages = typeof messages;

type Join<K extends string, P extends string> = `${K}.${P}`;
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>>;
}[keyof T & string];

export type MessageKey = Paths<Messages>;

/** Semua teks antarmuka lewat sini, bukan ditulis langsung di komponen (AGENTS.md §5). */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let node: unknown = messages;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  let text = typeof node === "string" ? node : key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{{${k}}}`, String(v));
  return text;
}

/**
 * Untuk kunci yang dirakit saat berjalan (mis. `resources.${nama}.title`). Kunci tetap harus ada di
 * messages/id.json; tes memeriksa semua kunci sumber data master.
 */
export function td(key: string, vars?: Record<string, string | number>): string {
  return t(key as MessageKey, vars);
}
