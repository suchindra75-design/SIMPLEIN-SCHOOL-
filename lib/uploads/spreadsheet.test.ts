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
  MAX_IMPORT_COLUMNS,
  XLSX_LIMITS,
  XML_SCAN_LIMITS,
  classifyImportFile,
  csvTextProblem,
  inspectXlsxArchive,
  parseImportGrid,
  xlsxReadRoute,
  type ImportFile,
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
      ...le32(payload.length), ...le32(usz), ...le16(lname.length), ...le16(0), ...lname);
    for (const b of payload) parts.push(b); // not spread: large payloads exceed the argument limit
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

/** Classify, then parse — the import's own path. */
function importGrid(name: string, file: Uint8Array, rows = 10): unknown[][] {
  const kind = classifyImportFile(name, file);
  if ("problem" in kind) throw new Error(kind.problem);
  const parsed = parseImportGrid(kind, rows);
  if ("problem" in parsed) throw new Error(parsed.problem);
  return parsed.grid;
}

/** What the import parsed before the package rebuild: the upload itself. */
function previousGrid(file: Uint8Array, rows = 10): unknown[][] {
  const wb = XLSX.read(file, { type: "array", sheets: 0, sheetRows: rows, cellFormula: false, cellHTML: false, cellStyles: false });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, defval: "", raw: false });
}

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

/** A hand-built .xlsx: one worksheet with the given body, plus extra entries. */
function ooxml(sheetXml: string, extra: Entry[] = [], sheetType = "worksheet"): Uint8Array {
  return zip([
    { name: "[Content_Types].xml", data: bytes('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>') },
    { name: "_rels/.rels", data: bytes(`<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: bytes(`<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: bytes(`<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/${sheetType}" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: "xl/worksheets/sheet1.xml", data: bytes(sheetXml) },
    ...extra,
  ]);
}
const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
const TWO_ROWS = `<sheetData><row r="1">${inline("A1", "Admission No")}</row><row r="2">${inline("A2", "GPS-1")}</row></sheetData>`;
const sheet = (body: string) => `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${body}</worksheet>`;

/** A dBASE header made only of bytes a text check allows (0x83 or '0' first). */
function textDbf(first: number, b2: number, b3: number, fields: number): Uint8Array {
  const b = [first, 0x20, b2, b3, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x21, 0x20, ...Array(16).fill(0x20), 0x20, 0x64, 0x20, 0x20];
  for (let i = 0; i < fields; i++) b.push(0x46, ...Array(10).fill(0x20), 0x43, ...Array(6).fill(0x20), ...Array(14).fill(0x20));
  b.push(0x0d);
  return new Uint8Array(b);
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
      expect(classifyImportFile("students.xlsx", file)).toMatchObject({ kind: "xlsx", leadingBlankRow: false });
      expect(importGrid("students.xlsx", file)).toEqual([["Admission No", "Name"], ["A-1", "Asha"]]);
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
    const kind = classifyImportFile("s.csv", csv) as ImportFile;
    expect(kind).toMatchObject({ kind: "csv", leadingBlankRow: false });
    expect(kind.bytes).toBe(csv); // handed to the parser unchanged
    expect(parseImportGrid(kind, 10)).toEqual({
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

describe("parser routes that expand tiny inputs never run", () => {
  it("knows which text formats the parser would pick for a .csv (its first-byte dispatch)", () => {
    expect(xlsxReadRoute(textDbf(0x83, 0x20, 0x20, 1))).toBe("dbf");
    expect(xlsxReadRoute(textDbf(0x30, 0x0a, 0x0a, 1))).toBe("dbf");
    expect(xlsxReadRoute(bytes("ID;P\r\nE\r\n"))).toBe("sylk");
    expect(xlsxReadRoute(bytes("TABLE\r\n0,1\r\n"))).toBe("dif");
    expect(xlsxReadRoute(bytes("{\\rtf1 x}"))).toBe("rtf");
    expect(xlsxReadRoute(bytes("Admission No,Name\n"))).toBe("text");
    expect(xlsxReadRoute(bytes("1,Asha\n"))).toBe("text");
  });

  it("a .csv that starts like a dBASE file is read as CSV, not by the DBF parser (which loops a million rows)", () => {
    for (const file of [textDbf(0x83, 0x20, 0x20, 5), textDbf(0x30, 0x0a, 0x0a, 5)]) {
      const started = Date.now();
      const kind = classifyImportFile("students.csv", file) as ImportFile;
      expect(kind).toMatchObject({ kind: "csv", leadingBlankRow: true });
      expect(Array.isArray(importGrid("students.csv", file))).toBe(true);
      expect(Date.now() - started).toBeLessThan(500); // the DBF route took ~1.9 s for this 193-byte file
    }
  });

  it("SYLK, DIF, RTF and SocialCalc look-alikes are read as CSV too", () => {
    // As CSV (here with ";" as the separator): three short rows, not a SYLK cell at row 1,000,000.
    expect(importGrid("x.csv", bytes('ID;P\r\nC;Y1000000;X16000;K"x"\r\nE\r\n')).map((row) => row[0])).toEqual(["ID", "C", "E"]);
    for (const text of ["TABLE\r\n0,1\r\n", "{\\rtf1 {x}}", "socialcalc:version:1.5\nx"]) {
      expect((classifyImportFile("x.csv", bytes(text)) as ImportFile).leadingBlankRow).toBe(true);
      expect(importGrid("x.csv", bytes(text)).length).toBeGreaterThan(0);
    }
  });

  it("a real CSV whose header starts with ID still imports normally", () => {
    expect(importGrid("s.csv", bytes("ID,Admission No,First Name\r\n1,GPS-1,Asha\r\n"))).toEqual([
      ["ID", "Admission No", "First Name"],
      ["1", "GPS-1", "Asha"],
    ]);
  });

  it("an .xlsx carrying ODS or Numbers markers is parsed from its worksheet only", () => {
    const odsContent = '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"><office:body><office:spreadsheet><table:table table:name="S"><table:table-row table:number-rows-repeated="1000"><table:table-cell table:number-columns-repeated="200"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>';
    const ods = ooxml(sheet(TWO_ROWS), [
      { name: "META-INF/manifest.xml", data: bytes("<manifest/>") },
      { name: "content.xml", data: bytes(odsContent) },
    ]);
    expect(importGrid("x.xlsx", ods)).toEqual([["Admission No"], ["GPS-1"]]);
    const numbers = ooxml(sheet(TWO_ROWS), [{ name: "Index/Document.iwa", data: bytes("x".repeat(64)) }]);
    expect(importGrid("x.xlsx", numbers)).toEqual([["Admission No"], ["GPS-1"]]);
  });

  it("hyperlink and column ranges, merges and drawings in the sheet are dropped before parsing", () => {
    const body = `<cols><col min="1" max="100000" width="9"/></cols>${TWO_ROWS}<mergeCells count="1"><mergeCell ref="A1:Z2000"/></mergeCells><hyperlinks><hyperlink ref="A1:Z2000" location="S!A1"/></hyperlinks>`;
    const file = ooxml(sheet(body));
    const opts = { type: "array", sheetRows: 5000, cellFormula: false, cellHTML: false, cellStyles: false } as const;
    const cells = (wb: XLSX.WorkBook) => Object.keys(wb.Sheets[wb.SheetNames[0]!]!).filter((k) => !k.startsWith("!")).length;
    // Parsed as uploaded, the hyperlink creates a cell for every address in A1:Z2000.
    expect(cells(XLSX.read(file, opts))).toBe(26 * 2000);
    const kind = classifyImportFile("x.xlsx", file) as ImportFile;
    expect(cells(XLSX.read(kind.bytes, opts))).toBe(2);
    expect(importGrid("x.xlsx", file, 5000)).toEqual([["Admission No"], ["GPS-1"]]);
  });

  it("only the first MAX_IMPORT_COLUMNS columns are read", () => {
    const file = ooxml(sheet(`<sheetData><row r="1">${inline("A1", "Admission No")}${inline("XFD1", "far")}</row><row r="202">${inline("A202", "x")}</row></sheetData>`));
    const started = Date.now();
    const grid = importGrid("x.xlsx", file, 202);
    expect(grid).toHaveLength(202);
    expect(grid.every((row) => row.length === MAX_IMPORT_COLUMNS)).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000); // 202 × 16,384 cells took ~2.2 s
  });

  it("refuses unsafe part names and a first sheet that is not a worksheet", () => {
    for (const name of ["../evil.xml", "xl\\evil.xml", "/xl/evil.xml"]) {
      expect(classifyImportFile("x.xlsx", ooxml(sheet(TWO_ROWS), [{ name, data: bytes("<x/>") }]))).toEqual({ problem: M.invalid });
    }
    expect(classifyImportFile("x.xlsx", ooxml(sheet(TWO_ROWS), [], "chartsheet"))).toEqual({ problem: M.noWorksheet });
  });

  it("the parser only ever sees the rebuilt package", () => {
    vi.mocked(XLSX.read).mockClear();
    importGrid("x.xlsx", ooxml(sheet(TWO_ROWS), [{ name: "META-INF/manifest.xml", data: bytes("<manifest/>") }]));
    const seen = vi.mocked(XLSX.read).mock.calls[0]![0] as Uint8Array;
    const parts = new Map<string, Uint8Array>();
    expect(inspectXlsxArchive(seen, XLSX_LIMITS, parts)).toBeNull();
    expect([...parts.keys()].sort()).toEqual(["[content_types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
  });
});

describe("normal files parse exactly as before", () => {
  it("workbooks from the spreadsheet library: text, numbers, dates, several sheets", () => {
    const rows = [
      ["Admission No", "First Name", "Date of Birth", "Roll", "Fee"],
      ["007", "Asha", new Date(Date.UTC(2010, 4, 14)), 7, 1234.5],
      ["GPS-2", "Ravi", new Date(Date.UTC(2011, 0, 2)), 12, 0],
    ];
    for (const date1904 of [false, true]) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: "dd/mm/yyyy" }), "Students");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["other"]]), "Other");
      if (date1904) wb.Workbook = { WBProps: { date1904: true } };
      const file = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "buffer", compression: true }) as Buffer);
      expect(importGrid("s.xlsx", file)).toEqual(previousGrid(file));
    }
  });

  it("namespace-prefixed worksheets", () => {
    const x = "x:";
    const prefixed = `<${x}worksheet xmlns:${x.slice(0, -1)}="${NS_MAIN}"><${x}sheetData><${x}row r="1"><${x}c r="A1" t="inlineStr"><${x}is><${x}t>Admission No</${x}t></${x}is></${x}c></${x}row></${x}sheetData></${x}worksheet>`;
    const file = ooxml(prefixed);
    expect(importGrid("x.xlsx", file)).toEqual(previousGrid(file));
  });

  it("CSV files: BOM, quoted commas, leading zeros, dates, semicolons", () => {
    for (const text of [
      "\ufeffAdmission No,Name,DOB\r\n007,\"Sharma, Asha\",2010-05-14\r\n",
      "Admission No;Name\n0012;Ravi\n",
      "sep=;\nAdmission No;Name\nA1;Asha\n",
    ]) {
      const file = bytes(text);
      expect(importGrid("s.csv", file)).toEqual(previousGrid(file));
    }
  });
});

/** A package with explicit workbook, relationships and sheet XML (for scanner tests). */
function pkg(parts: { workbook?: string; rels?: string; sheet?: string; extra?: Entry[] }): Uint8Array {
  return zip([
    { name: "[Content_Types].xml", data: bytes('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>') },
    { name: "_rels/.rels", data: bytes(`<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: bytes(parts.workbook ?? `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: bytes(parts.rels ?? `<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: "xl/worksheets/sheet1.xml", data: bytes(parts.sheet ?? sheet(TWO_ROWS)) },
    ...(parts.extra ?? []),
  ]);
}

/** Classify (and parse, when accepted) within a time budget; the gate must never be slow. */
function timed(file: Uint8Array): { ms: number; problem?: string; grid?: unknown[][] } {
  const started = performance.now();
  const kind = classifyImportFile("x.xlsx", file);
  if ("problem" in kind) return { ms: performance.now() - started, problem: kind.problem };
  const parsed = parseImportGrid(kind, 202);
  return { ms: performance.now() - started, ...("problem" in parsed ? { problem: parsed.problem } : { grid: parsed.grid }) };
}

describe("the gate's own XML scanning is linear and bounded", () => {
  // 20,000 unclosed openers took 2.6–9.8 s each with the earlier <name[^>]*> regexes.
  const N = 20_000;
  const WB_HEAD = `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets>`;

  it.each([
    ["workbook <sheet", { workbook: "<sheet ".repeat(N) }],
    ["workbook <workbookPr", { workbook: WB_HEAD + "<workbookPr ".repeat(N) + "</workbook>" }],
    ["relationships <Relationship", { rels: "<Relationships>" + "<Relationship ".repeat(N) }],
    ["worksheet root <worksheet", { sheet: "<worksheet ".repeat(N) }],
    ["worksheet <sheetData", { sheet: `<worksheet xmlns="${NS_MAIN}">` + "<sheetData ".repeat(N) }],
  ])("repeated unclosed %s openers are scanned in linear time", (_label, parts) => {
    const result = timed(pkg(parts));
    expect(result.ms).toBeLessThan(250);
  });

  it("workbook parts over the scan limit are refused before any scanning", () => {
    const big = "<x/>".repeat(Math.ceil(XML_SCAN_LIMITS.workbookPartBytes / 4) + 1);
    expect(timed(pkg({ workbook: big })).problem).toBe(M.tooComplex);
    expect(timed(pkg({ rels: big })).problem).toBe(M.tooComplex);
  });

  it("the worksheet root must start near the top and fit the tag limit", () => {
    const late = `<!--${" ".repeat(XML_SCAN_LIMITS.rootTagWindow)}-->${sheet(TWO_ROWS)}`;
    expect(timed(pkg({ sheet: late })).problem).toBe(M.noWorksheet);
    const huge = `<worksheet xmlns="${NS_MAIN}" a="${"x".repeat(XML_SCAN_LIMITS.tagBytes)}">${TWO_ROWS}</worksheet>`;
    expect(timed(pkg({ sheet: huge })).problem).toBe(M.noWorksheet);
  });

  it("crafted root tags: self-closing is refused, a fake dimension inside an attribute is harmless", () => {
    const selfClosing = `<worksheet xmlns="${NS_MAIN}" a="<dimension ref='A1:XFD1048576'/>${TWO_ROWS}</worksheet>`;
    expect(timed(pkg({ sheet: selfClosing })).problem).toBe(M.noWorksheet);
    const open = `<worksheet xmlns="${NS_MAIN}" a="<dimension ref='A1:XFD1048576'>${TWO_ROWS}</worksheet>`;
    const result = timed(pkg({ sheet: open }));
    expect(result.ms).toBeLessThan(500);
    expect(result.grid?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it("a fake whole-sheet <dimension> element is dropped with the rest of the sheet metadata", () => {
    const result = timed(pkg({ sheet: sheet(`<dimension ref="A1:XFD1048576"/>${TWO_ROWS}`) }));
    expect(result.grid).toEqual([["Admission No"], ["GPS-1"]]);
    expect(result.ms).toBeLessThan(500);
  });

  it("malformed XML is refused or parsed quickly, never hangs", () => {
    expect(timed(pkg({ sheet: `<worksheet xmlns="${NS_MAIN}"><sheetData><row r="1">` })).problem).toBe(M.invalid); // unclosed sheetData
    expect(timed(pkg({ workbook: "<workbook><sheets><sheet name='S'" })).problem).toBe(M.invalid); // unclosed tag
    expect(timed(pkg({ rels: "<Relationships><Relationship Id=\"rId1\" Type=\"x/worksheet\" Target=\"worksheets/sheet1.xml\"" })).problem).toBe(M.invalid);
    for (const body of ['<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>x</sheetData>', "<sheetData><<<>>><row r=><c></sheetData>", `<sheetData>${"<c ".repeat(N)}</sheetData>`]) {
      const started = performance.now();
      try {
        timed(pkg({ sheet: sheet(body) }));
      } catch {
        // the parser may reject garbage; it must do so quickly
      }
      expect(performance.now() - started).toBeLessThan(500);
    }
  });

  it("XML entities are not expanded (billion laughs)", () => {
    const laughs = `<!DOCTYPE sst [<!ENTITY a "xxxxxxxxxx"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;"><!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;"><!ENTITY e "&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;"><!ENTITY f "&e;&e;&e;&e;&e;&e;&e;&e;&e;&e;">]><sst xmlns="${NS_MAIN}"><si><t>&f;</t></si></sst>`;
    const file = pkg({
      rels: `<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS_REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
      sheet: sheet('<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData>'),
      extra: [{ name: "xl/sharedStrings.xml", data: bytes(laughs) }],
    });
    const result = timed(file);
    expect(String(result.grid?.[0]?.[0] ?? "").length).toBeLessThan(100); // 10^6 characters if expanded
    expect(result.ms).toBeLessThan(500);
  });

  it("a sheet with far too many columns yields at most MAX_IMPORT_COLUMNS columns, in bounded time", () => {
    let body = "<sheetData>";
    for (let r = 1; r <= 202; r++) {
      body += `<row r="${r}">`;
      for (let c = 0; c < 300; c++) body += `<c r="${XLSX.utils.encode_col(c)}${r}"><v>${c}</v></c>`;
      body += "</row>";
    }
    const result = timed(pkg({ sheet: sheet(body + "</sheetData>") }));
    expect(result.grid).toHaveLength(202);
    expect(result.grid!.every((row) => row.length === MAX_IMPORT_COLUMNS)).toBe(true);
    expect(result.ms).toBeLessThan(3000);
  });
});

describe("the linear scanner still reads every real-world tag form", () => {
  const SHEET = sheet(`<sheetData><row r="1">${inline("A1", "Admission No")}${inline("B1", "Name")}</row><row r="2">${inline("A2", "GPS-1")}${inline("B2", "Asha")}</row></sheetData>`);
  const EXPECTED = [["Admission No", "Name"], ["GPS-1", "Asha"]];

  it.each([
    ["single-quoted attributes", { workbook: `<workbook xmlns='${NS_MAIN}' xmlns:r='${NS_REL}'><sheets><sheet name='S' sheetId='1' r:id='rId1'/></sheets></workbook>`, rels: `<Relationships xmlns='${NS_PKG}'><Relationship Target='worksheets/sheet1.xml' Type='${NS_REL}/worksheet' Id='rId1'/></Relationships>` }],
    ["line breaks and spaces around =", { workbook: `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet\n  name = "S"\n  sheetId="1"\n  r:id =\n"rId1" /></sheets></workbook>` }],
    ["another prefix for the relationship id and prefixed relationships", { workbook: `<workbook xmlns="${NS_MAIN}" xmlns:ns2="${NS_REL}"><sheets><sheet name="S" sheetId="1" ns2:id="rId1"/></sheets></workbook>`, rels: `<pr:Relationships xmlns:pr="${NS_PKG}"><pr:Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="/xl/worksheets/sheet1.xml"/></pr:Relationships>` }],
    ["XML declaration, comments and a BOM before the root", { sheet: `\ufeff<?xml version="1.0" encoding="UTF-8"?>\n<!-- exported -->\n${SHEET}` }],
    ["other sheets and external relationships listed first", { workbook: `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet name="S" sheetId="1" r:id="rId9"/><sheet name="T" sheetId="2" r:id="rId1"/></sheets></workbook>`, rels: `<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/other.xml"/><Relationship Id="rX" Type="${NS_REL}/hyperlink" Target="https://example.org" TargetMode="External"/><Relationship Id="rId9" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` }],
  ])("%s", (_label, parts) => {
    const file = pkg({ sheet: SHEET, ...parts });
    expect(timed(file).grid).toEqual(EXPECTED);
    expect(importGrid("x.xlsx", file)).toEqual(previousGrid(file));
  });

  it("the 1904 date flag is still read, in either quoting style", () => {
    for (const pr of ['<workbookPr date1904="1"/>', "<workbookPr\n date1904='true'/>"]) {
      const wb = `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${pr}<sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`;
      const file = pkg({ workbook: wb, sheet: sheet(`<sheetData><row r="1">${inline("A1", "Admission No")}</row><row r="2"><c r="A2" s="0"><v>1</v></c></row></sheetData>`) });
      expect(importGrid("x.xlsx", file)).toEqual(previousGrid(file));
    }
  });
});
