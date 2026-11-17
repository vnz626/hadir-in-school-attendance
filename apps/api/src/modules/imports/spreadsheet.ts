import ExcelJS from "exceljs";
import { validationError } from "../../common/errors";

/** Penanda urutan byte UTF-8 di awal CSV buatan Excel. */
const BOM_CODE = 0xfeff;

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export interface SheetRow {
  /** Nomor baris di berkas asal (header = baris 1), supaya pengguna bisa menemukannya. */
  rowNumber: number;
  cells: Record<string, string>;
}

export interface ParsedSheet {
  headers: string[];
  rows: SheetRow[];
  format: "xlsx" | "csv";
}

/** "NIS ", "Nama Lengkap" -> "nis", "nama_lengkap". */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const isXlsx = (buf: Buffer) => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK": zip

/** CSV sederhana sesuai RFC 4180 dengan pemisah `,` atau `;` (Excel berbahasa Indonesia memakai `;`). */
export function parseCsv(text: string): string[][] {
  const body = text.charCodeAt(0) === BOM_CODE ? text.slice(1) : text;
  const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text.trim(); // hyperlink
    if ("result" in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v && Array.isArray(v.richText))
      return v.richText
        .map((r) => r.text)
        .join("")
        .trim();
    return "";
  }
  return String(v).trim();
}

/** Membaca xlsx atau csv. Jenis berkas ditentukan dari ISI (tanda "PK"), bukan ekstensi. */
export async function parseSpreadsheet(buf: Buffer): Promise<ParsedSheet> {
  if (buf.length === 0) throw validationError("Berkas kosong.");
  if (buf.length > MAX_IMPORT_BYTES) throw validationError("Berkas terlalu besar. Maksimal 2 MB.");

  let matrix: string[][];
  let format: ParsedSheet["format"];
  if (isXlsx(buf)) {
    format = "xlsx";
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      throw validationError(
        "Berkas Excel tidak bisa dibaca. Pastikan formatnya .xlsx dan tidak rusak.",
      );
    }
    const ws = wb.worksheets[0];
    if (!ws) throw validationError("Berkas Excel tidak punya lembar kerja.");
    matrix = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value));
      matrix[rowNumber - 1] = cells;
    });
  } else {
    format = "csv";
    const text = buf.toString("utf8");
    if (text.includes("\u0000"))
      throw validationError("Berkas bukan Excel (.xlsx) maupun CSV teks.");
    matrix = parseCsv(text);
  }

  const headerRow = matrix[0] ?? [];
  const headers = headerRow.map(normalizeHeader);
  if (headers.every((h) => h === ""))
    throw validationError(
      "Baris pertama harus berisi judul kolom. Pakai templat dari halaman impor.",
    );

  const rows: SheetRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const raw = matrix[i];
    if (!raw || raw.every((c) => c.trim() === "")) continue;
    const cells: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) cells[h] = (raw[idx] ?? "").trim();
    });
    rows.push({ rowNumber: i + 1, cells });
    if (rows.length > MAX_IMPORT_ROWS)
      throw validationError(`Terlalu banyak baris. Maksimal ${MAX_IMPORT_ROWS} baris per impor.`);
  }
  if (rows.length === 0)
    throw validationError("Berkas tidak berisi baris data di bawah judul kolom.");
  return { headers, rows, format };
}
