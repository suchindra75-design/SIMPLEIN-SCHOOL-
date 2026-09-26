import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

/**
 * Report-card PDF generator (Phase 7).
 *
 * DECISION (docs/ARCHITECTURE.md §22): pdf-lib templating — pure JS, no
 * headless browser, runs in the Vercel Node runtime, deterministic output.
 * A4 portrait, StandardFonts (Helvetica) so no external font files are
 * shipped. School branding = name + primary color stored in the system;
 * the logo IMAGE is not embedded in V1 (schools.logo_path records a storage
 * path without a bucket reference — embedding lands with the documents
 * module), documented as deferred.
 */

export interface ReportCardPdfSubject {
  subjectName: string;
  marksObtained: number | null;
  maxMarks: number;
  isAbsent: boolean;
  grade: string | null;
}

export interface ReportCardPdfData {
  schoolName: string;
  primaryColor: string | null;
  studentName: string;
  admissionNo: string;
  className: string;
  sectionName: string | null;
  academicYear: string;
  examName: string;
  subjects: ReportCardPdfSubject[];
  totalObtained: number;
  maxTotal: number;
  percentage: number | null;
  overallGrade: string | null;
  attendance: { present: number; absent: number; leave: number; percentage: number | null };
  remarks: string | null;
  status: string;
  generatedAt: string;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = Number.parseInt(full.slice(0, 6).padEnd(6, "0"), 16);
  if (Number.isNaN(n)) return { r: 0x1f, g: 0x3b, b: 0x73 };
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size = 10,
  color = rgb(0.1, 0.1, 0.12),
): void {
  page.drawText(text, { x, y, size, font, color });
}

function sanitize(text: string): string {
  // pdf-lib StandardFonts are WinAnsi; strip unsupported characters.
  return text.replace(/[^\x20-\x7E\n]/g, "?");
}

/** Renders the A4 report card PDF. Returns the bytes. */
export async function generateReportCardPdf(
  data: ReportCardPdfData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Report Card - ${sanitize(data.studentName)} (${sanitize(data.examName)})`);
  doc.setProducer("SIMPLEIN SCHOOL ERP");
  const page = doc.addPage(A4);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const brand = data.primaryColor
    ? (() => {
        const { r, g, b } = hexToRgb(data.primaryColor);
        return rgb(r / 255, g / 255, b / 255);
      })()
    : rgb(0.12, 0.23, 0.45);

  let y = A4[1] - MARGIN;

  // Header: school branding.
  drawText(page, bold, sanitize(data.schoolName), MARGIN, y, 18, brand);
  y -= 14;
  drawText(page, regular, "Report Card", MARGIN, y, 11, rgb(0.35, 0.35, 0.4));
  drawText(
    page,
    regular,
    sanitize(`Generated: ${data.generatedAt}`),
    MARGIN,
    y,
    8,
    rgb(0.5, 0.5, 0.55),
  );
  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4[0] - MARGIN, y },
    thickness: 1,
    color: brand,
  });
  y -= 24;

  // Student info block.
  const info: [string, string][] = [
    ["Student", data.studentName],
    ["Admission No", data.admissionNo],
    [
      "Class / Section",
      `${data.className}${data.sectionName ? ` - ${data.sectionName}` : ""}`,
    ],
    ["Academic Year", data.academicYear],
    ["Exam", data.examName],
  ];
  for (const [label, value] of info) {
    drawText(page, bold, `${label}:`, MARGIN, y, 10);
    drawText(page, regular, sanitize(value), MARGIN + 110, y, 10);
    y -= 16;
  }
  y -= 8;

  // Marks table.
  drawText(page, bold, "Subject-wise marks", MARGIN, y, 12, brand);
  y -= 18;
  const colX: [number, number, number, number] = [
    MARGIN,
    MARGIN + 260,
    MARGIN + 350,
    MARGIN + 440,
  ];
  drawText(page, bold, "Subject", colX[0], y, 10);
  drawText(page, bold, "Marks", colX[1], y, 10);
  drawText(page, bold, "Max", colX[2], y, 10);
  drawText(page, bold, "Grade", colX[3], y, 10);
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4[0] - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.8),
  });
  y -= 14;
  for (const s of data.subjects) {
    drawText(page, regular, sanitize(s.subjectName), colX[0], y, 10);
    drawText(
      page,
      regular,
      s.isAbsent ? "AB" : (s.marksObtained === null ? "-" : String(s.marksObtained)),
      colX[1],
      y,
      10,
    );
    drawText(page, regular, String(s.maxMarks), colX[2], y, 10);
    drawText(page, regular, s.grade ?? "-", colX[3], y, 10);
    y -= 15;
  }
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4[0] - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.8),
  });
  y -= 20;

  // Totals + result.
  drawText(page, bold, "Total", colX[0], y, 11);
  drawText(
    page,
    bold,
    `${data.totalObtained} / ${data.maxTotal}`,
    colX[1],
    y,
    11,
  );
  drawText(
    page,
    bold,
    data.percentage === null ? "-" : `${data.percentage}%`,
    colX[2],
    y,
    11,
  );
  drawText(page, bold, data.overallGrade ?? "-", colX[3], y, 11);
  y -= 28;

  // Attendance summary.
  drawText(page, bold, "Attendance", MARGIN, y, 12, brand);
  y -= 18;
  const attPct =
    data.attendance.percentage === null ? "-" : `${data.attendance.percentage}%`;
  drawText(
    page,
    regular,
    sanitize(
      `Present: ${data.attendance.present}   Absent: ${data.attendance.absent}   Leave: ${data.attendance.leave}   Attendance: ${attPct}`,
    ),
    MARGIN,
    y,
    10,
  );
  y -= 28;

  // Remarks.
  drawText(page, bold, "Remarks", MARGIN, y, 12, brand);
  y -= 16;
  drawText(
    page,
    regular,
    sanitize(data.remarks ?? "-"),
    MARGIN,
    y,
    10,
    rgb(0.2, 0.2, 0.25),
  );
  y -= 40;

  // Status footer.
  drawText(
    page,
    bold,
    `Result status: ${data.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT (not published)"}`,
    MARGIN,
    y,
    10,
    data.status === "PUBLISHED" ? rgb(0.1, 0.5, 0.25) : rgb(0.7, 0.45, 0.1),
  );

  return doc.save();
}
