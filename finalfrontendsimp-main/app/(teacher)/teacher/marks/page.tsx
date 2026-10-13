"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useMockStore } from "@/lib/mock-store";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { calculateGrade } from "@/lib/domain";
import {
  FileSpreadsheet,
  Save,
  Send,
  Check,
} from "lucide-react";

export default function TeacherMarksPage() {
  const { exams, sections, students, marks, saveMarksBatch } = useMockStore();

  const [selectedExamId, setSelectedExamId] = useState<string>(
    exams.find((e) => e.status !== "PUBLISHED")?.id || exams[0]?.id || ""
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string>("sec-5a");
  const [selectedSubject, setSelectedSubject] = useState<string>("General Science");

  const [marksState, setMarksState] = useState<
    Record<string, { marksObtained: number; remarks: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const selectedExam = exams.find((e) => e.id === selectedExamId) || exams[0];
  const maxMarks = selectedExam?.maxMarksPerSubject || 100;

  const sectionStudents = useMemo(() => {
    return students.filter((s) => s.sectionId === selectedSectionId);
  }, [students, selectedSectionId]);

  useEffect(() => {
    const existingMap: Record<string, { marksObtained: number; remarks: string }> = {};

    for (const student of sectionStudents) {
      const rec = marks.find(
        (m) =>
          m.examId === selectedExamId &&
          m.studentId === student.id &&
          m.subject.toLowerCase() === selectedSubject.toLowerCase()
      );

      if (rec) {
        existingMap[student.id] = {
          marksObtained: rec.marksObtained,
          remarks: rec.remarks || "",
        };
      } else {
        existingMap[student.id] = {
          marksObtained: 75,
          remarks: "Satisfactory",
        };
      }
    }

    setMarksState(existingMap);
    setSaveSuccess(null);
  }, [selectedExamId, selectedSectionId, selectedSubject, sectionStudents, marks]);

  const handleMarkChange = (studentId: string, val: string) => {
    let num = parseInt(val, 10);
    if (isNaN(num)) num = 0;
    if (num > maxMarks) num = maxMarks;
    if (num < 0) num = 0;

    setMarksState((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        marksObtained: num,
      },
    }));
  };

  const handleRemarksChange = (studentId: string, remarks: string) => {
    setMarksState((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks,
      },
    }));
  };

  const handleSave = async (isSubmission = false) => {
    setSaving(true);
    const batch = sectionStudents.map((s) => {
      const obtained = marksState[s.id]?.marksObtained ?? 75;
      const { grade } = calculateGrade(obtained, maxMarks);
      return {
        examId: selectedExamId,
        studentId: s.id,
        subject: selectedSubject,
        marksObtained: obtained,
        maxMarks,
        grade,
        remarks: marksState[s.id]?.remarks || "Good effort",
      };
    });

    await saveMarksBatch(batch);
    setSaving(false);
    setSaveSuccess(
      isSubmission
        ? "Marks submitted to Principal's office for verification!"
        : "Marks draft saved successfully in session store."
    );
    setTimeout(() => setSaveSuccess(null), 3500);
  };

  const currentAverage = useMemo(() => {
    if (sectionStudents.length === 0) return 0;
    let sum = 0;
    for (const s of sectionStudents) {
      sum += marksState[s.id]?.marksObtained ?? 0;
    }
    return Math.round((sum / sectionStudents.length) * 10) / 10;
  }, [sectionStudents, marksState]);

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header Controls */}
        <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2 font-serif">
              <FileSpreadsheet className="w-5 h-5 text-zinc-900" />
              Academic Marks Entry Register
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">
              Input student assessment scores, compute grades, and submit for administrative review
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="text-xs rounded border border-zinc-200 bg-white py-1.5 px-2.5 font-semibold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
            >
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title} ({exam.status})
                </option>
              ))}
            </select>

            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="text-xs rounded border border-zinc-200 bg-white py-1.5 px-2.5 font-semibold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
            >
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.fullName}
                </option>
              ))}
            </select>

            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="text-xs rounded border border-zinc-200 bg-white py-1.5 px-2.5 font-semibold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
            >
              {selectedExam.subjects.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>
          </div>
        </div>

        {saveSuccess && (
          <div className="p-3 rounded bg-zinc-900 text-white text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-white" />
            <span className="font-semibold">{saveSuccess}</span>
          </div>
        )}

        {/* Live Calculation Banner */}
        <div className="bg-zinc-950 text-white rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs font-mono">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-zinc-400">
              Exam: <strong className="text-white">{selectedExam.title}</strong>
            </span>
            <span className="text-zinc-400">
              Subject: <strong className="text-white">{selectedSubject}</strong>
            </span>
            <span className="text-zinc-300">
              Section Average: <strong className="text-white">{currentAverage} / {maxMarks}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save Draft
            </button>

            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-black bg-white hover:bg-zinc-100 rounded transition-colors shadow-xs disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Submit to Principal
            </button>
          </div>
        </div>

        {/* Marks Entry Table */}
        <div className="bg-white rounded-lg border border-zinc-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700 font-semibold">
                  <th className="py-3 px-4 w-20">Roll #</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4 w-36">Marks (Max {maxMarks})</th>
                  <th className="py-3 px-4 w-24 text-center">Grade</th>
                  <th className="py-3 px-4">Performance Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sectionStudents.map((student) => {
                  const currentMark = marksState[student.id]?.marksObtained ?? 75;
                  const currentRemark = marksState[student.id]?.remarks ?? "";
                  const { grade, label } = calculateGrade(currentMark, maxMarks);

                  return (
                    <tr key={student.id} className="hover:bg-zinc-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-zinc-950">
                        {student.rollNumber}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-zinc-950 block">
                          {student.fullName}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max={maxMarks}
                            value={currentMark}
                            onChange={(e) => handleMarkChange(student.id, e.target.value)}
                            className="w-20 px-2.5 py-1 text-xs font-mono font-bold text-zinc-950 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 bg-zinc-50 focus:bg-white text-right"
                          />
                          <span className="text-zinc-400 font-mono text-[11px]">
                            / {maxMarks}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded font-mono font-bold text-[11px] bg-zinc-100 text-zinc-950 border border-zinc-300">
                          {grade}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={currentRemark}
                          onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                          placeholder={label}
                          className="w-full max-w-sm px-2.5 py-1 text-xs rounded border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400 text-zinc-800"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AsyncStateWrapper>
  );
}
