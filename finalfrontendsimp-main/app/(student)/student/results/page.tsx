"use client";

import React, { useState, useMemo } from "react";
import { useMockStore } from "@/lib/mock-store";
import { StatCard } from "@/components/shared/StatCard";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate, isExamPublished } from "@/lib/domain";
import { Award, Printer, CheckCircle2, AlertCircle, School, BookOpen } from "lucide-react";

export default function StudentResultsPage() {
  const { students, activeStudentId, exams, marks, school, sections, classes } = useMockStore();

  const student = students.find((s) => s.id === activeStudentId) || students[0];
  const section = sections.find((sec) => sec.id === student?.sectionId);
  const gradeClass = classes.find((c) => c.id === section?.classId);

  const publishedExams = useMemo(() => {
    return exams.filter((e) => isExamPublished(e));
  }, [exams]);

  const [selectedExamId, setSelectedExamId] = useState<string>(
    publishedExams[0]?.id || ""
  );

  const selectedExam = publishedExams.find((e) => e.id === selectedExamId) || publishedExams[0];

  const studentMarks = useMemo(() => {
    if (!selectedExam) return [];
    return marks.filter((m) => m.studentId === student?.id && m.examId === selectedExam.id);
  }, [marks, student, selectedExam]);

  const totalObtained = useMemo(() => {
    return studentMarks.reduce((acc, m) => acc + m.marksObtained, 0);
  }, [studentMarks]);

  const totalMax = useMemo(() => {
    return studentMarks.reduce((acc, m) => acc + m.maxMarks, 0);
  }, [studentMarks]);

  const overallPercentage = useMemo(() => {
    if (totalMax === 0) return 0;
    return Math.round((totalObtained / totalMax) * 1000) / 10;
  }, [totalObtained, totalMax]);

  const getOverallGrade = (pct: number) => {
    if (pct >= 90) return "A";
    if (pct >= 80) return "B";
    if (pct >= 70) return "C";
    if (pct >= 60) return "D";
    return "F";
  };

  if (!student) return null;

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2 font-serif">
              <Award className="w-5 h-5 text-zinc-900" />
              My Academic Report Card
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Grade {gradeClass?.name || "5"}-{section?.name || "A"} • Roll: {student.rollNumber} • Certified Examination Records
            </p>
          </div>

          <div className="flex items-center gap-3">
            {publishedExams.length > 0 && (
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="text-xs rounded border border-zinc-200 bg-white py-1.5 px-2.5 font-semibold text-zinc-900 font-mono"
              >
                {publishedExams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({e.term})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:border-zinc-900 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Transcript</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Aggregate Score"
            value={`${totalObtained} / ${totalMax}`}
            subtext="Verified marks across subjects"
            icon={BookOpen}
          />
          <StatCard
            label="Overall Percentage"
            value={`${overallPercentage}%`}
            subtext={`Academic Standing: Grade ${getOverallGrade(overallPercentage)}`}
            icon={Award}
          />
          <StatCard
            label="Evaluation Status"
            value="Certified"
            subtext="Principal seal applied"
            icon={CheckCircle2}
          />
        </div>

        {/* Detailed Transcript Card */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 shadow-2xs space-y-6">
          {/* Certificate Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-200 pb-6 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-zinc-950 text-white flex items-center justify-center font-bold">
                <School className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-zinc-950 uppercase tracking-tight">
                  {school.name}
                </h2>
                <div className="text-xs font-mono text-zinc-500">
                  {selectedExam?.title || "Academic Assessment"} • {school.academicYear}
                </div>
              </div>
            </div>

            <div className="text-right text-xs font-mono space-y-1">
              <div>
                <span className="text-zinc-500">Scholar:</span>{" "}
                <strong className="text-zinc-900">{student.fullName}</strong>
              </div>
              <div>
                <span className="text-zinc-500">Roll Number:</span>{" "}
                <strong className="text-zinc-900">{student.rollNumber}</strong>
              </div>
              <div>
                <span className="text-zinc-500">Class:</span>{" "}
                <strong className="text-zinc-900">
                  Grade {gradeClass?.name || "5"} ({section?.name || "A"})
                </strong>
              </div>
            </div>
          </div>

          {/* Marks Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/75 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  <th className="py-3 px-4 font-semibold">Subject</th>
                  <th className="py-3 px-4 font-semibold text-center">Max Marks</th>
                  <th className="py-3 px-4 font-semibold text-center">Marks Obtained</th>
                  <th className="py-3 px-4 font-semibold text-center">Percentage</th>
                  <th className="py-3 px-4 font-semibold text-center">Letter Grade</th>
                  <th className="py-3 px-4 font-semibold">Faculty Evaluation Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono">
                {studentMarks.map((m) => {
                  const pct = Math.round((m.marksObtained / m.maxMarks) * 100);
                  return (
                    <tr key={m.id} className="hover:bg-zinc-50/50">
                      <td className="py-3 px-4 font-semibold text-zinc-950 font-sans text-xs">
                        {m.subject}
                      </td>
                      <td className="py-3 px-4 text-center text-zinc-500">{m.maxMarks}</td>
                      <td className="py-3 px-4 text-center font-bold text-zinc-900">
                        {m.marksObtained}
                      </td>
                      <td className="py-3 px-4 text-center text-zinc-700">{pct}%</td>
                      <td className="py-3 px-4 text-center font-bold text-zinc-950">
                        <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-xs">
                          {m.grade}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans text-xs text-zinc-600">
                        {m.remarks || "Exemplary demonstration of core competencies."}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Transcript Footer Signatures */}
          <div className="pt-8 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-zinc-500 font-mono">
            <div>
              <div className="text-zinc-950 font-bold mb-1">
                Class Mentor: Sarah Jenkins
              </div>
              <p className="text-zinc-500 text-[11px] leading-relaxed">
                Lucas demonstrates profound aptitude in empirical sciences and logical deduction. Continuous effort recommended in analytical reading.
              </p>
            </div>
            <div className="sm:text-right flex flex-col justify-end">
              <div className="border-t border-dashed border-zinc-300 pt-2 w-48 sm:ml-auto">
                <div className="text-zinc-950 font-bold">{school.principalName}</div>
                <div className="text-[10px] text-zinc-400">Principal & Chief Academic Officer</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AsyncStateWrapper>
  );
}
