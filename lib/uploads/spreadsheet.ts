import { posix } from "node:path";
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
 *   - several of its parsers expand tiny inputs into huge work: a DBF header
 *     claims a million rows, an ODS cell repeats 1,048,576 × 16,384 times, a
 *     single XLSX hyperlink or column range covers every cell of the sheet.
 * So the gate:
 *   1. accepts only .csv and .xlsx names (no legacy .xls), and requires the
 *      content to match the name;
 *   2. CSV: text only (no control bytes, which every binary format has) and
 *      not markup. The parser's own first-byte dispatch (xlsxReadRoute) would
 *      send some text to its DBF, SYLK, DIF, RTF or SocialCalc parsers; such
 *      files get one leading newline, which makes the parser read them as
 *      CSV (the resulting blank first row is dropped). Every CSV is parsed by
 *      the CSV parser, whatever its first bytes;
 *   3. XLSX: walks the ZIP exactly as the parser will (end record found the
 *      same way, central directory in the same order, local headers at the
 *      same offsets) and inflates every entry itself with a hard output cap,
 *      never trusting the declared sizes: at most XLSX_LIMITS.maxEntries
 *      entries and XLSX_LIMITS.maxUncompressedBytes in total; no encryption,
 *      ZIP64, comments, trailing data, duplicate, inconsistent or unsafe
 *      entry names; stored/deflate only; must contain xl/workbook.xml;
 *   4. XLSX: the parser never sees the uploaded package. The gate rebuilds a
 *      minimal one from the parts it already decompressed: the first sheet's
 *      cell data (<sheetData> only), shared strings, styles and the 1904 date
 *      flag. No ODS/Numbers/XLSB markers, hyperlinks, column ranges, merges,
 *      comments, drawings or other sheets reach the parser. The gate's own
 *      tag and attribute scanning is linear (findStartTag/attributes, no
 *      backtracking regular expressions) and bounded by XML_SCAN_LIMITS.
 * Then the file is parsed, first sheet only, without formulas/HTML/styles,
 * and only the first MAX_IMPORT_COLUMNS columns are turned into rows.
 * Remaining risk: the parser's own advisories (prototype pollution, ReDoS)
 * apply to the cell data, shared strings and styles it still reads, all
 * within the size limits above; see docs/PRODUCTION_READINESS.md.
 */
export const XLSX_LIMITS = {
  /** Workbooks from Excel, LibreOffice or Google Sheets have 10–30 parts. */
  maxEntries: 100,
  /** All parts together, after decompression (a 200-row sheet is well under 1 MB). */
  maxUncompressedBytes: 10_000_000,
} as const;

/** Columns read from the sheet (the import maps 13 fields; extra columns are ignored). */
export const MAX_IMPORT_COLUMNS = 64;

export type ImportFileKind = "csv" | "xlsx";

/** What the parser may read: the CSV as uploaded (or forced to the CSV route), or a rebuilt workbook. */
export interface ImportFile {
  kind: ImportFileKind;
  bytes: Uint8Array;
  /** A newline was prepended to force the CSV parser; drop the blank first row. */
  leadingBlankRow: boolean;
}

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
  csvOtherFormat: "The file is not a CSV text file. Save it as CSV (UTF-8) and try again.",
  noWorksheet: "The first sheet of the workbook is not a regular worksheet. Move the student list to the first sheet.",
  tooComplex: "The workbook's structure is too large to import. Save it as a simple .xlsx or CSV.",
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

const DBF_VERSIONS = [0x02, 0x03, 0x30, 0x31, 0x83, 0x8b, 0x8c, 0xf5];
// Comparisons as the parser makes them: a byte past the end is undefined,
// and every comparison with undefined is false.
const le = (v: number | undefined, x: number) => v !== undefined && v <= x;
const lt = (v: number | undefined, x: number) => v !== undefined && v < x;
const ge = (v: number | undefined, x: number) => v !== undefined && v >= x;

/**
 * The parser xlsx 0.18.5 picks for these bytes: a line-by-line copy of the
 * first-byte dispatch in its readSync(). "text" means its CSV/plain-text
 * parser (which still switches to XML after leading whitespace + "<", and to
 * SocialCalc on a "socialcalc:version:" prefix).
 */
export function xlsxReadRoute(b: Uint8Array): string {
  const n = (i: number): number | undefined => b[i];
  switch (n(0)) {
    case 0xd0:
      if (hasSignature(b, 0, SIG_CFB)) return "cfb";
      break;
    case 0x09:
      if (le(n(1), 0x08)) return "biff";
      break;
    case 0x3c:
      return "xml";
    case 0x49:
      if (n(1) === 0x49 && n(2) === 0x2a && n(3) === 0x00) return "tiff";
      if (n(1) === 0x44) return "sylk";
      break;
    case 0x54:
      if (n(1) === 0x41 && n(2) === 0x42 && n(3) === 0x4c) return "dif";
      break;
    case 0x50:
      return n(1) === 0x4b && lt(n(2), 0x09) && lt(n(3), 0x09) ? "zip" : "text";
    case 0xef:
      return n(3) === 0x3c ? "xml" : "text";
    case 0xff:
      if (n(1) === 0xfe) return "utf16";
      if (n(1) === 0x00 && n(2) === 0x02 && n(3) === 0x00) return "lotus";
      break;
    case 0x00:
      if (n(1) === 0x00) {
        if (ge(n(2), 0x02) && n(3) === 0x00) return "lotus";
        if (n(2) === 0x00 && (n(3) === 0x08 || n(3) === 0x09)) return "lotus";
      }
      break;
    case 0x03:
    case 0x83:
    case 0x8b:
    case 0x8c:
      return "dbf";
    case 0x7b:
      if (n(1) === 0x5c && n(2) === 0x72 && n(3) === 0x74) return "rtf";
      break;
    case 0x0a:
    case 0x0d:
    case 0x20:
      return "text";
    case 0x89:
      if (n(1) === 0x50 && n(2) === 0x4e && n(3) === 0x47) return "png";
      break;
  }
  const first = n(0);
  if (first !== undefined && DBF_VERSIONS.includes(first) && le(n(2), 12) && le(n(3), 31)) return "dbf";
  return "text";
}

/** Problem message for a CSV upload, or null when it is plain text. */
export function csvTextProblem(bytes: Uint8Array): string | null {
  for (const b of bytes) {
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return IMPORT_FILE_MESSAGES.csvBinary;
  }
  let i = hasSignature(bytes, 0, [0xef, 0xbb, 0xbf]) ? 3 : 0; // UTF-8 BOM
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  if (bytes[i] === 0x3c) return IMPORT_FILE_MESSAGES.csvMarkup; // "<" selects the XML/HTML parsers
  return null;
}

/**
 * The bytes to hand the parser for an accepted CSV, so that it always uses
 * its CSV parser. Text it would already read as CSV is returned unchanged
 * (same results as before). Text whose first bytes select another text
 * format (DBF, SYLK, DIF, RTF, SocialCalc) gets one leading newline: the
 * parser then takes its plain-text route, skips the whitespace and parses
 * CSV. Returns null for anything else (binary formats; not reached after
 * csvTextProblem, kept as a fail-closed default).
 */
export function csvForParser(bytes: Uint8Array): { bytes: Uint8Array; leadingBlankRow: boolean } | null {
  const route = xlsxReadRoute(bytes);
  const socialCalc = latin1(bytes.subarray(0, 19)) === "socialcalc:version:";
  if (route === "text" && !socialCalc) return { bytes, leadingBlankRow: false };
  if (route === "text" || route === "dbf" || route === "sylk" || route === "dif" || route === "rtf") {
    const forced = new Uint8Array(bytes.length + 1);
    forced[0] = 0x0a;
    forced.set(bytes, 1);
    return { bytes: forced, leadingBlankRow: true };
  }
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
  /** When given, receives every decompressed part, keyed by lower-case name. */
  parts?: Map<string, Uint8Array>,
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
    // Package part names are relative, forward-slash paths (no "..", no
    // backslashes, which the parser would also treat as separators).
    if (key === "" || key.startsWith("/") || key.includes("\\") || key.split("/").includes("..")) {
      return IMPORT_FILE_MESSAGES.invalid;
    }
    if (seen.has(key)) return IMPORT_FILE_MESSAGES.invalid;
    seen.add(key);
    if (key === "xl/workbook.bin") return IMPORT_FILE_MESSAGES.xlsb;
    if (key === "xl/workbook.xml") hasWorkbook = true;

    let actual: number;
    if (method === 0) {
      if (csz !== usz) return IMPORT_FILE_MESSAGES.invalid;
      actual = csz;
      parts?.set(key, bytes.subarray(dataStart, dataStart + csz));
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
        parts?.set(key, new Uint8Array(out.buffer.buffer, out.buffer.byteOffset, out.buffer.length));
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

/* ------------------------- minimal package rebuild ------------------------- */

// Package parts are handled as latin1 strings: one character per byte, so
// slicing and re-encoding keeps the original UTF-8 bytes exactly.
const asText = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("latin1");
const asBytes = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));

/**
 * Bounds for the parts the gate itself reads with string searches. Real
 * workbook.xml / workbook.xml.rels files are a few KB and a worksheet's root
 * element starts within its first few hundred bytes.
 */
export const XML_SCAN_LIMITS = {
  /** xl/workbook.xml and xl/_rels/workbook.xml.rels, each. */
  workbookPartBytes: 1_000_000,
  /** The worksheet root element must start within this many characters. */
  rootTagWindow: 65_536,
  /** Longest start tag the gate reads (root elements carry namespace declarations). */
  tagBytes: 65_536,
} as const;

interface StartTag {
  index: number;
  /** The whole start tag, "<" through ">". */
  tag: string;
  /** Namespace prefix including the colon ("x:"), or "". */
  prefix: string;
  selfClosing: boolean;
}

// XML name characters as the gate needs them (ASCII letters, digits, _ . - :).
function isNameChar(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f || c === 0x2e || c === 0x2d || c === 0x3a;
}
const isSpace = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;

/**
 * The first start tag whose local name is `localName` (any prefix), at or
 * after `from` and starting before `startBefore`. Linear time: every "<" is
 * looked at once, its name read once, and only a matching tag is followed to
 * its ">" (one indexOf). Regular expressions of the form `<name[^>]*>` are
 * avoided because each unclosed opener makes them rescan the rest of the text,
 * which is quadratic. A matching tag longer than XML_SCAN_LIMITS.tagBytes, or
 * one without a ">", yields null (the caller treats it as invalid).
 */
function findStartTag(xml: string, localName: string, from = 0, startBefore = xml.length): StartTag | null {
  let at = xml.indexOf("<", from);
  while (at !== -1 && at < startBefore) {
    let end = at + 1;
    while (end < xml.length && isNameChar(xml.charCodeAt(end))) end++;
    const qname = xml.slice(at + 1, end);
    const colon = qname.lastIndexOf(":");
    const next = xml.charCodeAt(end);
    if ((colon === -1 ? qname : qname.slice(colon + 1)) === localName && (isSpace(next) || next === 0x2f || next === 0x3e)) {
      const close = xml.indexOf(">", end);
      if (close === -1 || close + 1 - at > XML_SCAN_LIMITS.tagBytes) return null;
      return {
        index: at,
        tag: xml.slice(at, close + 1),
        prefix: colon === -1 ? "" : qname.slice(0, colon + 1),
        selfClosing: xml.charCodeAt(close - 1) === 0x2f,
      };
    }
    at = xml.indexOf("<", end);
  }
  return null;
}

/**
 * Attributes of a start tag, keyed by local name (r:id → "id"); the first
 * occurrence wins. Linear: one pass, quoted values found with indexOf.
 * Stops at the first malformed attribute.
 */
function attributes(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 1;
  while (i < tag.length && isNameChar(tag.charCodeAt(i))) i++; // element name
  for (;;) {
    while (i < tag.length && isSpace(tag.charCodeAt(i))) i++;
    const nameStart = i;
    while (i < tag.length && isNameChar(tag.charCodeAt(i))) i++;
    if (i === nameStart) break;
    const qname = tag.slice(nameStart, i);
    while (i < tag.length && isSpace(tag.charCodeAt(i))) i++;
    if (tag[i] !== "=") break;
    i++;
    while (i < tag.length && isSpace(tag.charCodeAt(i))) i++;
    const quote = tag[i];
    if (quote !== '"' && quote !== "'") break;
    const close = tag.indexOf(quote, i + 1);
    if (close === -1) break;
    const local = qname.slice(qname.lastIndexOf(":") + 1);
    if (!out.has(local)) out.set(local, tag.slice(i + 1, close));
    i = close + 1;
  }
  return out;
}

function relationships(rels: string): { id: string; type: string; target: string }[] {
  const out: { id: string; type: string; target: string }[] = [];
  for (let tag = findStartTag(rels, "Relationship"); tag !== null; tag = findStartTag(rels, "Relationship", tag.index + tag.tag.length)) {
    const a = attributes(tag.tag);
    const id = a.get("Id");
    const type = a.get("Type");
    const target = a.get("Target");
    if (id !== undefined && type !== undefined && target !== undefined && a.get("TargetMode") !== "External") {
      out.push({ id, type, target });
    }
  }
  return out;
}

/** Part name a workbook relationship points at (relative to xl/, or absolute). */
function resolvePart(target: string): string | null {
  const path = target.startsWith("/") ? target.slice(1) : posix.normalize(`xl/${target}`);
  return path.startsWith("../") || path.startsWith("/") ? null : path.toLowerCase();
}

/** Stored (uncompressed) ZIP of the given parts; the parser does not check CRCs, but they are correct. */
function storedZip(files: [string, Uint8Array][]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const le16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
  const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  for (const [name, data] of files) {
    const nameBytes = asBytes(name);
    const crc = crc32(data);
    const header = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...le16(20), ...le16(0), ...le16(0), ...le32(0), ...le32(crc),
      ...le32(data.length), ...le32(data.length), ...le16(nameBytes.length), ...le16(0), ...nameBytes]);
    central.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02, ...le16(20), ...le16(20), ...le16(0), ...le16(0), ...le32(0), ...le32(crc),
      ...le32(data.length), ...le32(data.length), ...le16(nameBytes.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0),
      ...le32(0), ...le32(offset), ...nameBytes]));
    chunks.push(header, data);
    offset += header.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...le16(0), ...le16(0), ...le16(files.length), ...le16(files.length),
    ...le32(cdSize), ...le32(offset), ...le16(0)]);
  const out = new Uint8Array(offset + cdSize + end.length);
  let at = 0;
  for (const c of [...chunks, ...central, end]) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

let crcTable: Uint32Array | undefined;
function crc32(data: Uint8Array): number {
  if (crcTable === undefined) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/**
 * A new, minimal .xlsx built from the uploaded package's decompressed parts:
 * the first sheet's <sheetData> (inside that sheet's own root element, so its
 * namespaces stay valid), shared strings, styles and the 1904 date flag.
 * Everything else in the upload is dropped before the parser runs.
 */
export function rebuildImportWorkbook(parts: Map<string, Uint8Array>): { bytes: Uint8Array } | { problem: string } {
  const workbook = parts.get("xl/workbook.xml");
  const wbRels = parts.get("xl/_rels/workbook.xml.rels");
  if (workbook === undefined || wbRels === undefined) return { problem: IMPORT_FILE_MESSAGES.invalid };
  // Size limits first: everything below scans these strings.
  if (workbook.length > XML_SCAN_LIMITS.workbookPartBytes || wbRels.length > XML_SCAN_LIMITS.workbookPartBytes) {
    return { problem: IMPORT_FILE_MESSAGES.tooComplex };
  }
  const wbXml = asText(workbook);
  const firstSheet = findStartTag(wbXml, "sheet");
  const sheetRelId = firstSheet === null ? undefined : attributes(firstSheet.tag).get("id");
  const rels = relationships(asText(wbRels));
  const sheetRel = rels.find((r) => r.id === sheetRelId);
  if (sheetRel === undefined) return { problem: IMPORT_FILE_MESSAGES.invalid };
  if (!sheetRel.type.endsWith("/worksheet")) return { problem: IMPORT_FILE_MESSAGES.noWorksheet };
  const sheetName = resolvePart(sheetRel.target);
  const sheet = sheetName === null ? undefined : parts.get(sheetName);
  if (sheet === undefined) return { problem: IMPORT_FILE_MESSAGES.invalid };

  const sheetXml = asText(sheet);
  // The root element must start near the top of the part (after the XML
  // declaration); looking only there keeps this search small.
  const root = findStartTag(sheetXml, "worksheet", 0, XML_SCAN_LIMITS.rootTagWindow);
  if (root === null || root.selfClosing) return { problem: IMPORT_FILE_MESSAGES.noWorksheet };
  const prefix = root.prefix;
  // First <sheetData> with the root's prefix, after the root tag.
  let open = findStartTag(sheetXml, "sheetData", root.index + root.tag.length);
  while (open !== null && open.prefix !== prefix) open = findStartTag(sheetXml, "sheetData", open.index + open.tag.length);
  let sheetData = `<${prefix}sheetData/>`;
  if (open !== null) {
    if (open.selfClosing) sheetData = open.tag;
    else {
      const closeTag = `</${prefix}sheetData>`;
      const close = sheetXml.indexOf(closeTag, open.index);
      if (close < 0) return { problem: IMPORT_FILE_MESSAGES.invalid };
      sheetData = sheetXml.slice(open.index, close + closeTag.length);
    }
  }
  const newSheet = `${XML_DECL}${root.tag}${sheetData}</${prefix}worksheet>`;

  const workbookPr = findStartTag(wbXml, "workbookPr");
  const is1904 = workbookPr !== null && ["1", "true"].includes(attributes(workbookPr.tag).get("date1904") ?? "");
  const partFor = (suffix: string) => {
    const rel = rels.find((r) => r.type.endsWith(suffix));
    const name = rel === undefined ? null : resolvePart(rel.target);
    return name === null ? undefined : parts.get(name);
  };
  const strings = partFor("/sharedStrings");
  const styles = partFor("/styles");

  const files: [string, Uint8Array][] = [
    ["[Content_Types].xml", asBytes(
      `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      (strings ? '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' : "") +
      (styles ? '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' : "") +
      "</Types>",
    )],
    ["_rels/.rels", asBytes(
      `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    )],
    ["xl/workbook.xml", asBytes(
      `${XML_DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${is1904 ? '<workbookPr date1904="1"/>' : ""}` +
      '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    )],
    ["xl/_rels/workbook.xml.rels", asBytes(
      `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
      (strings ? `<Relationship Id="rId2" Type="${NS_REL}/sharedStrings" Target="sharedStrings.xml"/>` : "") +
      (styles ? `<Relationship Id="rId3" Type="${NS_REL}/styles" Target="styles.xml"/>` : "") +
      "</Relationships>",
    )],
    ["xl/worksheets/sheet1.xml", asBytes(newSheet)],
  ];
  if (strings) files.push(["xl/sharedStrings.xml", strings]);
  if (styles) files.push(["xl/styles.xml", styles]);
  return { bytes: storedZip(files) };
}

/**
 * Which import format a file is, or a problem message. Checks name AND
 * content. `bytes` is what the parser may read: the upload itself for CSV,
 * the rebuilt minimal package for XLSX.
 */
export function classifyImportFile(name: string, bytes: Uint8Array): ImportFile | { problem: string } {
  const lower = name.toLowerCase();
  const isZip = hasSignature(bytes, 0, SIG_LOCAL);
  if (hasSignature(bytes, 0, SIG_CFB) || lower.endsWith(".xls")) return { problem: IMPORT_FILE_MESSAGES.legacy };
  if (lower.endsWith(".xlsx")) {
    if (!isZip) return { problem: IMPORT_FILE_MESSAGES.mismatch };
    const parts = new Map<string, Uint8Array>();
    const problem = inspectXlsxArchive(bytes, XLSX_LIMITS, parts);
    if (problem !== null) return { problem };
    const rebuilt = rebuildImportWorkbook(parts);
    return "problem" in rebuilt ? rebuilt : { kind: "xlsx", bytes: rebuilt.bytes, leadingBlankRow: false };
  }
  if (lower.endsWith(".csv")) {
    if (isZip) return { problem: IMPORT_FILE_MESSAGES.mismatch };
    const problem = csvTextProblem(bytes);
    if (problem !== null) return { problem };
    const forParser = csvForParser(bytes);
    return forParser === null ? { problem: IMPORT_FILE_MESSAGES.csvOtherFormat } : { kind: "csv", ...forParser };
  }
  return { problem: IMPORT_FILE_MESSAGES.extension };
}

/**
 * Parse what classifyImportFile returned into rows of cell text: first sheet
 * only, at most `maxRows` rows and MAX_IMPORT_COLUMNS columns, no
 * formulas/HTML/styles.
 */
export function parseImportGrid(file: ImportFile, maxRows: number): { grid: unknown[][] } | { problem: string } {
  const extra = file.leadingBlankRow ? 1 : 0;
  const workbook = XLSX.read(file.bytes, {
    type: "array",
    sheets: 0,
    sheetRows: maxRows + extra,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
  });
  const firstSheet = workbook.SheetNames[0];
  const sheet = firstSheet === undefined ? undefined : workbook.Sheets[firstSheet];
  if (sheet === undefined) return { problem: "Workbook contains no sheets" };
  // A cell far to the right would otherwise turn every row into a
  // 16,384-column array; columns past the cap are never mapped anyway.
  const ref = sheet["!ref"];
  if (ref !== undefined) {
    const range = XLSX.utils.decode_range(ref);
    range.e.c = Math.min(range.e.c, range.s.c + MAX_IMPORT_COLUMNS - 1);
    sheet["!ref"] = XLSX.utils.encode_range(range);
  }
  let grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  if (file.leadingBlankRow && grid.length > 0 && (grid[0] ?? []).every((cell) => cell === "")) grid = grid.slice(1);
  return { grid: grid.slice(0, maxRows) };
}
