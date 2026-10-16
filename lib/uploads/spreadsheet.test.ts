import { constants, deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

// Spy on the parser so tests can prove a rejected file never reaches it.
vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return { ...actual, read: vi.fn(actual.read) };
});

import {
  IMPORT_FILE_MESSAGES as M,
  XLSX_LIMITS,
  classifyImportFile,
  csvTextProblem,
  inspectXlsxArchive,
  parseImportGrid,
} from "@/lib/uploads/spreadsheet";
import { previewStudentImport } from "@/lib/services/imports";
import type { SessionContext } from "@/lib/auth/session";
import type { DbClient } from "@/lib/services/errors";

/* ----------------------------- ZIP builder ----------------------------- */

interface Entry {
  name: string;
  data: Uint8Array; // uncompressed content
  method?: 0 | 8;
  flags?: number;
  /** Override what the headers claim (the gate must not trust these). */
  claimUsz?: number;
  localName?: string;
  raw?: Uint8Array; // pre-compressed payload (for bombs)
}

const le16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const bytes = (s: string) => new TextEncoder().encode(s);

function zip(
  entries: Entry[],
  opts: { comment?: string; trailing?: Uint8Array; prefix?: Uint8Array; cdOffsetOverride?: number } = {},
): Uint8Array {
  const parts: number[] = [...(opts.prefix ?? [])];
  const central: number[] = [];
  for (const e of entries) {
    const method = e.method ?? 8;
    const payload = e.raw ?? (method === 8 ? new Uint8Array(deflateRawSync(e.data)) : e.data);
    const usz = e.claimUsz ?? e.data.length;
    const flags = e.flags ?? 0;
    const offset = parts.length;
    const lname = bytes(e.localName ?? e.name);
    parts.push(...[0x50, 0x4b, 0x03, 0x04], ...le16(20), ...le16(flags), ...le16(method), ...le32(0), ...le32(0),
      ...le32(payload.length), ...le32(usz), ...le16(lname.length), ...le16(0), ...lname, ...payload);
    const name = bytes(e.name);
    central.push(...[0x50, 0x4b, 0x01, 0x02], ...le16(20), ...le16(20), ...le16(flags), ...le16(method), ...le32(0), ...le32(0),
      ...le32(payload.length), ...le32(usz), ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0),
      ...le32(offset), ...name);
  }
  const cdOffset = opts.cdOffsetOverride ?? parts.length;
  const comment = bytes(opts.comment ?? "");
  const out = [...parts, ...central,
    ...[0x50, 0x4b, 0x05, 0x06], ...le16(0), ...le16(0), ...le16(entries.length), ...le16(entries.length),
    ...le32(central.length), ...le32(cdOffset), ...le16(comment.length), ...comment, ...(opts.trailing ?? [])];
  return new Uint8Array(out);
}

const WORKBOOK = { name: "xl/workbook.xml", data: bytes("<workbook/>") };

/** A deflate stream that inflates to `mb` MB of "a" but is only a few KB:
 *  one compressed 1 MB block (full flush, so blocks are independent) repeated. */
function bomb(mb: number): Uint8Array {
  const block = new Uint8Array(deflateRawSync(Buffer.alloc(1024 * 1024, 0x61), { finishFlush: constants.Z_FULL_FLUSH }));
  const last = new Uint8Array(deflateRawSync(Buffer.alloc(0)));
  const out = new Uint8Array(block.length * mb + last.length);
  for (let i = 0; i < mb; i++) out.set(block, i * block.length);
  out.set(last, block.length * mb);
  return out;
}

function realWorkbook(sheets: Record<string, unknown[][]>, compression = true): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "buffer", compression }) as Buffer);
}

const adminCtx = {
  profile: { id: "u-admin", schoolId: "school-a" },
  roles: ["SCHOOL_ADMIN"],
} as unknown as SessionContext;
const unusedDb = {} as DbClient; // the gate must reject before any database access

/* -------------------------------- tests -------------------------------- */

describe("xlsx archive gate", () => {
  it("accepts real workbooks (compressed and stored) and parses only the first sheet", () => {
    for (const compression of [true, false]) {
      const file = realWorkbook({ Students: [["Admission No", "Name"], ["A-1", "Asha"]], Other: [["x"]] }, compression);
      expect(inspectXlsxArchive(file)).toBeNull();
      expect(classifyImportFile("students.xlsx", file)).toEqual({ kind: "xlsx" });
      const parsed = parseImportGrid(file, 10);
      expect(parsed).toEqual({ grid: [["Admission No", "Name"], ["A-1", "Asha"]] });
    }
    const wb = XLSX.read(realWorkbook({ First: [["a"]], Second: [["b"]] }), { type: "array", sheets: 0 });
    expect(Object.keys(wb.Sheets)).toEqual(["First"]);
  });

  it("rejects a decompression bomb before the parser sees it, quickly", async () => {
    const file = zip([WORKBOOK, { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(0), raw: bomb(48), claimUsz: 48 * 1024 * 1024 }]);
    expect(file.length).toBeLessThan(200_000); // ~48 MB of XML in well under 200 KB
    const started = Date.now();
    expect(inspectXlsxArchive(file)).toBe(M.tooLarge);
    expect(Date.now() - started).toBeLessThan(2000);
    vi.mocked(XLSX.read).mockClear();
    await expect(previewStudentImport(unusedDb, adminCtx, { name: "bomb.xlsx", bytes: file.slice().buffer })).rejects.toThrow(M.tooLarge);
    expect(XLSX.read).not.toHaveBeenCalled();
  });

  it("does not trust declared sizes: an entry claiming 1 KB that inflates past the cap is refused", () => {
    const file = zip([WORKBOOK, { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(0), raw: bomb(12), claimUsz: 1000 }]);
    expect(inspectXlsxArchive(file)).toBe(M.tooLarge);
    // Control: the same archive, honestly labelled, is well-formed — only its size is the problem.
    const honest = zip([WORKBOOK, { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(0), raw: bomb(12), claimUsz: 12 * 1024 * 1024 }]);
    expect(inspectXlsxArchive(honest)).toBe(M.tooLarge);
    expect(inspectXlsxArchive(honest, { maxEntries: 100, maxUncompressedBytes: 13 * 1024 * 1024 })).toBeNull();
  });

  it("refuses an entry whose real size differs from the declared size", () => {
    const file = zip([WORKBOOK, { name: "xl/worksheets/sheet1.xml", data: bytes("x".repeat(2000)), claimUsz: 1000 }]);
    expect(inspectXlsxArchive(file)).toBe(M.invalid);
  });

  it("enforces the total across entries, not just per entry", () => {
    const quarter = Math.ceil(XLSX_LIMITS.maxUncompressedBytes / 4) + 1;
    const entries = [WORKBOOK, ...[1, 2, 3, 4].map((i) => ({ name: `xl/media/p${i}.bin`, data: new Uint8Array(quarter) }))];
    expect(inspectXlsxArchive(zip(entries))).toBe(M.tooLarge);
  });

  it("limits the number of parts", () => {
    const many = Array.from({ length: XLSX_LIMITS.maxEntries + 1 }, (_, i) => ({ name: `xl/p${i}.xml`, data: bytes("<a/>") }));
    expect(inspectXlsxArchive(zip([WORKBOOK, ...many]))).toBe(M.tooManyParts);
  });

  it("refuses encryption, unknown compression, duplicates and inconsistent headers", () => {
    expect(inspectXlsxArchive(zip([{ ...WORKBOOK, flags: 0x1 }]))).toBe(M.encrypted);
    expect(inspectXlsxArchive(zip([WORKBOOK, { name: "xl/a.xml", data: bytes("<a/>"), method: 12 as 0, raw: bytes("BZh") }]))).toBe(M.invalid);
    expect(inspectXlsxArchive(zip([WORKBOOK, { name: "XL/Workbook.xml", data: bytes("<w/>") }]))).toBe(M.invalid);
    expect(inspectXlsxArchive(zip([WORKBOOK, { name: "xl/a.xml", localName: "xl/b.xml", data: bytes("<a/>") }]))).toBe(M.invalid);
    expect(inspectXlsxArchive(zip([{ name: "word/document.xml", data: bytes("<d/>") }]))).toBe(M.invalid); // no workbook
    expect(inspectXlsxArchive(zip([{ name: "xl/workbook.bin", data: bytes("bin") }]))).toBe(M.xlsb);
  });

  it("refuses comments, trailing or leading data and ZIP64-style offsets", () => {
    expect(inspectXlsxArchive(zip([WORKBOOK], { comment: "hello" }))).toBe(M.invalid);
    expect(inspectXlsxArchive(zip([WORKBOOK], { trailing: bytes("PK\u0005\u0006 extra") }))).toBe(M.invalid);
    expect(inspectXlsxArchive(zip([WORKBOOK], { prefix: bytes("prefix") }))).toBe(M.invalid);
    expect(inspectXlsxArchive(zip([WORKBOOK], { cdOffsetOverride: 0xffffffff }))).toBe(M.invalid);
    expect(inspectXlsxArchive(bytes("PK\u0003\u0004 truncated"))).toBe(M.invalid);
  });
});

describe("import file classification (name and content must agree)", () => {
  const xlsx = realWorkbook({ S: [["a"]] });
  const cfb = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

  it("drops legacy .xls, by name and by content", () => {
    expect(classifyImportFile("old.xls", cfb)).toEqual({ problem: M.legacy });
    expect(classifyImportFile("renamed.csv", cfb)).toEqual({ problem: M.legacy });
    expect(classifyImportFile("renamed.xlsx", cfb)).toEqual({ problem: M.legacy });
  });

  it("does not let a ZIP through as CSV, or text through as XLSX", () => {
    expect(classifyImportFile("students.csv", xlsx)).toEqual({ problem: M.mismatch });
    expect(classifyImportFile("students.xlsx", bytes("Admission No,Name\nA-1,Asha\n"))).toEqual({ problem: M.mismatch });
    expect(classifyImportFile("students.txt", bytes("a,b"))).toEqual({ problem: M.extension });
  });

  it("CSV must be plain text, not binary or markup", () => {
    expect(csvTextProblem(bytes("Admission No,Name\r\nA-1,\"Asha, K\"\r\n"))).toBeNull();
    expect(csvTextProblem(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("Name\tClass\n")]))).toBeNull();
    expect(csvTextProblem(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe(M.csvBinary); // UTF-16
    expect(csvTextProblem(new Uint8Array([0x03, 0x7a, 0x01, 0x01]))).toBe(M.csvBinary); // dBASE header
    expect(csvTextProblem(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("\n  <table><tr><td>x")]))).toBe(M.csvMarkup);
  });

  it("parses a normal CSV exactly as before", () => {
    const csv = bytes("Admission No,First Name,Class,Section\nGPS-1,Asha,Grade 9,A\n");
    expect(classifyImportFile("s.csv", csv)).toEqual({ kind: "csv" });
    expect(parseImportGrid(csv, 10)).toEqual({
      grid: [["Admission No", "First Name", "Class", "Section"], ["GPS-1", "Asha", "Grade 9", "A"]],
    });
  });

  it("previewStudentImport rejects bad files with the gate's message and never parses them", async () => {
    vi.mocked(XLSX.read).mockClear();
    for (const [name, content, message] of [
      ["old.xls", cfb, M.legacy],
      ["zip.csv", xlsx, M.mismatch],
      ["page.csv", bytes("<html><body>x</body></html>"), M.csvMarkup],
    ] as const) {
      await expect(previewStudentImport(unusedDb, adminCtx, { name, bytes: content.slice().buffer })).rejects.toThrow(message);
    }
    expect(XLSX.read).not.toHaveBeenCalled();
  });
});
