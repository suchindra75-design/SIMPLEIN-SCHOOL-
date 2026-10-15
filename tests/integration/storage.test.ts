import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateReportCard, getReportCardPdfUrl } from "@/lib/services/report-cards";
import { as, serviceClient, studentByAdmission } from "./helpers";

/**
 * Private files through real Supabase Storage + RLS: a family may only fetch
 * files that belong to rows it can see (its own child's published report card),
 * never another family's or an unpublished draft.
 */

let examId = "";
let reportCardId = "";
let pdfPath = "";
const createdPaths: string[] = [];

beforeAll(async () => {
  const db = serviceClient();
  const aarav = await studentByAdmission("GPS-2026-001");
  const { data: exam } = await db.from("exams").select("id").eq("class_id", aarav.class_id).eq("name", "Unit Test 1").single();
  examId = (exam as { id: string }).id;
  const admin = await as("admin");
  reportCardId = (await generateReportCard(admin.db, admin.ctx, aarav.id, examId)).id;
  const { data } = await db.from("report_cards").select("pdf_path, status").eq("id", reportCardId).single();
  pdfPath = (data as { pdf_path: string }).pdf_path;
  createdPaths.push(pdfPath);
});

afterAll(async () => {
  const db = serviceClient();
  await db.from("report_cards").delete().eq("exam_id", examId);
  if (createdPaths.length > 0) await db.storage.from("report-cards").remove(createdPaths);
  await db.from("exam_subjects").update({ is_published: false }).eq("exam_id", examId).neq("is_locked", true);
});

describe("report-card PDFs", () => {
  it("another family cannot sign or list a child's report-card PDF", async () => {
    const other = await as("parent2"); // Sneha's parent, not Aarav's
    const signed = await other.db.storage.from("report-cards").createSignedUrl(pdfPath, 60);
    expect(signed.error).not.toBeNull();
    const folder = pdfPath.split("/").slice(0, -1).join("/");
    const listed = await other.db.storage.from("report-cards").list(folder);
    expect(listed.data ?? []).toEqual([]);
  });

  it("the child's own parent cannot fetch a draft, but can once it is published", async () => {
    const parent = await as("parent");
    const direct = await parent.db.storage.from("report-cards").createSignedUrl(pdfPath, 60);
    expect(direct.error).not.toBeNull(); // draft (not every subject is published)

    const db = serviceClient();
    await db.from("exam_subjects").update({ is_published: true }).eq("exam_id", examId);
    const admin = await as("admin");
    const aarav = await studentByAdmission("GPS-2026-001");
    reportCardId = (await generateReportCard(admin.db, admin.ctx, aarav.id, examId)).id;
    const { data } = await db.from("report_cards").select("pdf_path, status").eq("id", reportCardId).single();
    expect((data as { status: string }).status).toBe("PUBLISHED");
    createdPaths.push((data as { pdf_path: string }).pdf_path);

    const url = await getReportCardPdfUrl(parent.db, parent.ctx, reportCardId);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:54321\/storage\/v1\/object\/sign\//);
    const other = await as("parent2");
    const stranger = await other.db.storage.from("report-cards").createSignedUrl((data as { pdf_path: string }).pdf_path, 60);
    expect(stranger.error).not.toBeNull();
  });
});

describe("homework files", () => {
  it("a teacher cannot write files for homework outside their sections", async () => {
    const anita = await as("teacher"); // no role in 10-A
    const db = serviceClient();
    const kavya = await studentByAdmission("GPS-2026-007");
    const { data: hw } = await db.from("homework").select("id").eq("section_id", kavya.section_id).limit(1).single();
    const path = `schools/${kavya.school_id}/homework/${(hw as { id: string }).id}/probe_${Date.now()}.txt`;
    const upload = await anita.db.storage
      .from("homework-attachments")
      .upload(path, new Blob(["probe"], { type: "text/plain" }), { contentType: "text/plain" });
    if (upload.error === null) await db.storage.from("homework-attachments").remove([path]);
    expect(upload.error).not.toBeNull();
  });
});
