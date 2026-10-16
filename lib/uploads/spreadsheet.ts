import { inflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";

/**
 * Student-import file gate, run before the spreadsheet parser sees a byte.
 *
 * xlsx 0.18.5 (the last version on npm) has open advisories (prototype
 * pollution, ReDoS) and no resource limits of its own:
 *   - it picks a parser from the file's CONTENT, not its name: a ".csv"
 *     upload that is really a ZIP, a legacy XLS (CFB), HTML/XML, DBF or Lotus
 *     file goes to that format's parser;
 *   - it inflates every ZIP entry in full before parsing (`sheetRows` only
 *     limits rows afterwards), so a 300 KB upload can expand to hundreds of MB.
 * So the gate:
 *   1. accepts only .csv and .xlsx names (no legacy .xls), and requires the
 *      content to match the name;
 *   2. CSV: text only (no control bytes, which every binary format has) and
 *      not markup (a leading "<" selects the XML/HTML parsers);
 *   3. XLSX: walks the ZIP exactly as the parser will (end record found the
 *      same way, central directory in the same order, local headers at the
 *      same offsets) and inflates every entry itself with a hard output cap,
 *      never trusting the declared sizes: at most XLSX_LIMITS.maxEntries
 *      entries and XLSX_LIMITS.maxUncompressedBytes in total; no encryption,
 *      ZIP64, comments, trailing data, duplicate or inconsistent entries;
 *      stored/deflate only; must contain xl/workbook.xml (not .xlsb).
 * Only then is the file parsed, first sheet only, without formulas/HTML/styles.
 * What it cannot do: bound the parser's CPU within those limits (the ReDoS
 * advisory). The input it reaches is bounded; see docs/PRODUCTION_READINESS.md.
 */
export const XLSX_LIMITS = {
  /** Workbooks from Excel, LibreOffice or Google Sheets have 10–30 parts. */
  maxEntries: 100,
  /** All parts together, after decompression (a 200-row sheet is well under 1 MB). */
  maxUncompressedBytes: 10_000_000,
} as const;

export type ImportFileKind = "csv" | "xlsx";

export const IMPORT_FILE_MESSAGES = {
  extension: "Upload a .csv or .xlsx file (save older .xls workbooks as .xlsx first)",
  mismatch: "The file's content does not match its extension. Upload a real .csv or .xlsx file.",
  legacy: "Old .xls workbooks cannot be imported. Save the file as .xlsx or CSV first.",
  csvBinary: "The CSV file contains binary data. Save it as CSV (UTF-8) and try again.",
  csvMarkup: "The file looks like a web page or XML, not CSV.",
  invalid: "The file is not a valid .xlsx workbook. Save it again as .xlsx or CSV.",
  encrypted: "Password-protected workbooks cannot be imported.",
  tooManyParts: "The workbook has too many parts to import. Save it as a simple .xlsx or CSV.",
  tooLarge: "The workbook is too large to import. Import at most 200 rows per file, or save it as CSV.",
  xlsb: "Binary .xlsb workbooks cannot be imported. Save the file as .xlsx or CSV.",
} as const;

const SIG_LOCAL = [0x50, 0x4b, 0x03, 0x04];
const SIG_CENTRAL = [0x50, 0x4b, 0x01, 0x02];
const SIG_END = [0x50, 0x4b, 0x05, 0x06];
const SIG_CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function hasSignature(bytes: Uint8Array, at: number, sig: readonly number[]): boolean {
  if (at < 0 || at + sig.length > bytes.length) return false;
  return sig.every((value, i) => bytes[at + i] === value);
}
const u16 = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u32 = (b: Uint8Array, at: number) =>
  ((b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16)) + (b[at + 3] ?? 0) * 0x1000000;
// The parser decodes entry names byte by byte (latin1); compare the same way.
const latin1 = (b: Uint8Array) => {
  let s = "";
  for (const c of b) s += String.fromCharCode(c);
  return s;
};

/** Problem message for a CSV upload, or null when it is plain text. */
export function csvTextProblem(bytes: Uint8Array): string | null {
  for (const b of bytes) {
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return IMPORT_FILE_MESSAGES.csvBinary;
  }
  let i = hasSignature(bytes, 0, [0xef, 0xbb, 0xbf]) ? 3 : 0; // UTF-8 BOM
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  if (bytes[i] === 0x3c) return IMPORT_FILE_MESSAGES.csvMarkup; // "<"
  return null;
}

/**
 * Problem message for an .xlsx upload, or null when the archive is within
 * limits. Every entry is decompressed (capped), so the result does not rely
 * on what the archive claims about itself.
 */
export function inspectXlsxArchive(
  bytes: Uint8Array,
  limits: { maxEntries: number; maxUncompressedBytes: number } = XLSX_LIMITS,
): string | null {
  const n = bytes.length;
  if (n < 22 + 30 || !hasSignature(bytes, 0, SIG_LOCAL)) return IMPORT_FILE_MESSAGES.invalid;

  // The parser takes the LAST end-of-central-directory signature in the
  // file; require it to be the final 22 bytes (no comment, nothing after it).
  let end = -1;
  for (let i = n - 4; i >= 0; i--) {
    if (hasSignature(bytes, i, SIG_END)) {
      end = i;
      break;
    }
  }
  if (end !== n - 22) return IMPORT_FILE_MESSAGES.invalid;
  const entries = u16(bytes, end + 8);
  const cdSize = u32(bytes, end + 12);
  const cdOffset = u32(bytes, end + 16);
  if (
    u16(bytes, end + 4) !== 0 ||
    u16(bytes, end + 6) !== 0 ||
    u16(bytes, end + 10) !== entries ||
    u16(bytes, end + 20) !== 0 ||
    cdOffset + cdSize !== end // also rules out ZIP64 markers and data appended after the directory
  ) {
    return IMPORT_FILE_MESSAGES.invalid;
  }
  if (entries === 0) return IMPORT_FILE_MESSAGES.invalid;
  if (entries > limits.maxEntries) return IMPORT_FILE_MESSAGES.tooManyParts;

  const seen = new Set<string>();
  let hasWorkbook = false;
  let total = 0;
  let p = cdOffset;
  for (let e = 0; e < entries; e++) {
    if (p + 46 > end || !hasSignature(bytes, p, SIG_CENTRAL)) return IMPORT_FILE_MESSAGES.invalid;
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    const csz = u32(bytes, p + 20);
    const usz = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = latin1(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (p > end) return IMPORT_FILE_MESSAGES.invalid;
    if (flags & 0x2041) return IMPORT_FILE_MESSAGES.encrypted;
    if (method !== 0 && method !== 8) return IMPORT_FILE_MESSAGES.invalid;

    if (local + 30 > cdOffset || !hasSignature(bytes, local, SIG_LOCAL)) return IMPORT_FILE_MESSAGES.invalid;
    const lNameLen = u16(bytes, local + 26);
    const lExtraLen = u16(bytes, local + 28);
    const lCsz = u32(bytes, local + 18);
    const lUsz = u32(bytes, local + 22);
    if (u16(bytes, local + 6) !== flags || u16(bytes, local + 8) !== method) return IMPORT_FILE_MESSAGES.invalid;
    if (latin1(bytes.subarray(local + 30, local + 30 + lNameLen)) !== name) return IMPORT_FILE_MESSAGES.invalid;
    const sizesAgree = lCsz === csz && lUsz === usz;
    const sizesDeferred = (flags & 0x08) !== 0 && lCsz === 0 && lUsz === 0; // data descriptor
    if (!sizesAgree && !sizesDeferred) return IMPORT_FILE_MESSAGES.invalid;
    const dataStart = local + 30 + lNameLen + lExtraLen;
    if (dataStart + csz > cdOffset) return IMPORT_FILE_MESSAGES.invalid;

    const key = name.toLowerCase();
    if (seen.has(key)) return IMPORT_FILE_MESSAGES.invalid;
    seen.add(key);
    if (key === "xl/workbook.bin") return IMPORT_FILE_MESSAGES.xlsb;
    if (key === "xl/workbook.xml") hasWorkbook = true;

    let actual: number;
    if (method === 0) {
      if (csz !== usz) return IMPORT_FILE_MESSAGES.invalid;
      actual = csz;
    } else {
      const budget = limits.maxUncompressedBytes - total;
      try {
        const out = inflateRawSync(bytes.subarray(dataStart, dataStart + csz), {
          maxOutputLength: Math.max(budget, 0) + 1,
          info: true,
        }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
        // The stream must end exactly where the directory says.
        if (out.engine.bytesWritten !== csz) return IMPORT_FILE_MESSAGES.invalid;
        actual = out.buffer.length;
      } catch (error) {
        if (error instanceof RangeError) return IMPORT_FILE_MESSAGES.tooLarge;
        return IMPORT_FILE_MESSAGES.invalid;
      }
      if (actual !== usz) return IMPORT_FILE_MESSAGES.invalid;
    }
    total += actual;
    if (total > limits.maxUncompressedBytes) return IMPORT_FILE_MESSAGES.tooLarge;
  }
  if (p !== end) return IMPORT_FILE_MESSAGES.invalid;
  if (!hasWorkbook) return IMPORT_FILE_MESSAGES.invalid;
  return null;
}

/** Which import format a file is, or a problem message. Checks name AND content. */
export function classifyImportFile(name: string, bytes: Uint8Array): { kind: ImportFileKind } | { problem: string } {
  const lower = name.toLowerCase();
  const isZip = hasSignature(bytes, 0, SIG_LOCAL);
  if (hasSignature(bytes, 0, SIG_CFB) || lower.endsWith(".xls")) return { problem: IMPORT_FILE_MESSAGES.legacy };
  if (lower.endsWith(".xlsx")) {
    if (!isZip) return { problem: IMPORT_FILE_MESSAGES.mismatch };
    const problem = inspectXlsxArchive(bytes);
    return problem === null ? { kind: "xlsx" } : { problem };
  }
  if (lower.endsWith(".csv")) {
    if (isZip) return { problem: IMPORT_FILE_MESSAGES.mismatch };
    const problem = csvTextProblem(bytes);
    return problem === null ? { kind: "csv" } : { problem };
  }
  return { problem: IMPORT_FILE_MESSAGES.extension };
}

/**
 * Parse an import file that passed classifyImportFile into rows of cell
 * text: first sheet only, at most `maxRows` rows, no formulas/HTML/styles.
 */
export function parseImportGrid(bytes: Uint8Array, maxRows: number): { grid: unknown[][] } | { problem: string } {
  const workbook = XLSX.read(bytes, {
    type: "array",
    sheets: 0,
    sheetRows: maxRows,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
  });
  const firstSheet = workbook.SheetNames[0];
  const sheet = firstSheet === undefined ? undefined : workbook.Sheets[firstSheet];
  if (sheet === undefined) return { problem: "Workbook contains no sheets" };
  return {
    grid: XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false }),
  };
}
