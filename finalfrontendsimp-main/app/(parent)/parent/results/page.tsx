"use client";

import React, { useState, useMemo } from "react";
import { useMockStore } from "@/lib/mock-store";
import { StatCard } from "@/components/shared/StatCard";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate, isExamPublished } from "@/lib/domain";
import { Award, Printer, CheckCircle2, AlertCircle } from "lucide-react";

export default function ParentResultsPage() {
  const { students, activeChildId, exams, marks, school } = useMockStore();

  const child = students.find((s) => s.id === activeChildId) || students[0];

  const publishedExams = useMemo(() => {
    return exams.filter((e) => isExamPublished(e));
  }, [exams]);

  const [selectedExamId, setSelectedExamId] = useState<string>(
    publishedExams[0]?.id || ""
  );

  const selectedExam = publishedExams.find((e) => e.id === selectedExamId) || publishedExams[0];

  const childMarks = useMemo(() => {
    if (!selectedExam) return [];
    return marks.filter((m) => m.studentId === child?.id && m.examId === selectedExam.id);
  }, [marks, child, selectedExam]);

  const totalObtained = useMemo(() => {
    return childMarks.reduce((acc, m) => acc + m.marksObtained, 0);
  }, [childMarks]);

  const totalMax = useMemo(() => {
    return childMarks.reduce((acc, m) => acc + m.maxMarks, 0);
  }, [childMarks]);

  const overallPercentage = useMemo(() => {
    if (totalMax === 0) return 0;
    return Math.round((totalObtained / totalMax) * 1000) / 10;
  }, [totalObtained, totalMax]);

  if (!child) return null;

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2 font-serif">
              <Award className="w-5 h-5 text-zinc-900" />
              Academic Report Card: {child.fullName}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Official examination assessments verified and published by the academic board
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
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200 rounded shadow-xs transition-colors font-mono"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Transcript
            </button>
          </div>
        </div>

        {publishedExams.length === 0 ? (
          <div className="bg-white rounded-lg border border-zinc-200 p-12 text-center shadow-xs">
            <AlertCircle className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-zinc-900">
              No Published Results Available
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              Examination marks for current term assessments are being processed and verified by the school administration.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Key Performance Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Overall Aggregate Score"
                value={`${totalObtained} / ${totalMax}`}
                subtext={`Cumulative total across ${childMarks.length} subjects`}
                icon={Award}
              />
              <StatCard
                label="Overall Assessment %"
                value={`${overallPercentage}%`}
                subtext="Standing benchmark"
                trend={{
                  positive: overallPercentage >= 75,
                  text: overallPercentage >= 85 ? "Distinction" : "First Class",
                }}
              />
              <StatCard
                label="Publication Status"
                value="Verified"
                subtext={`Released on ${formatFriendlyDate(selectedExam?.publishedAt || "2026-09-20")}`}
                icon={CheckCircle2}
              />
            </div>

            {/* Official Report Card Sheet */}
            <div className="bg-white rounded-lg border border-zinc-200 shadow-xs overflow-hidden">
              {/* Report Header */}
              <div className="p-6 bg-zinc-50 border-b border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest block">
                    {school.name}
                  </span>
                  <h2 className="text-lg font-bold text-zinc-950 mt-0.5 font-serif">
                    {selectedExam?.title}
                  </h2>
                  <p className="text-xs text-zinc-500 font-mono">
                    Academic Year {school.academicYear} • {selectedExam?.term}
                  </p>
                </div>

                <div className="text-xs space-y-1 bg-white p-3 rounded border border-zinc-200 text-zinc-700 font-mono">
                  <div>
                    Student: <strong className="text-zinc-950 font-sans">{child.fullName}</strong>
                  </div>
                  <div>
                    Roll: <span className="font-bold">{child.rollNumber}</span> | Section:{" "}
                    <strong>{child.className} - {child.sectionName}</strong>
                  </div>
                </div>
              </div>

              {/* Marks Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-white text-zinc-700 font-semibold font-mono">
                      <th className="py-3 px-4 font-sans">Subject</th>
                      <th className="py-3 px-4 text-right">Marks Obtained</th>
                      <th className="py-3 px-4 text-right">Maximum Marks</th>
                      <th className="py-3 px-4 text-center">Grade</th>
                      <th className="py-3 px-4 font-sans">Teacher Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {childMarks.map((m) => (
                      <tr key={m.id} className="hover:bg-zinc-50/60">
                        <td className="py-3 px-4 font-semibold text-zinc-950">
                          {m.subject}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-zinc-950 text-sm">
                          {m.marksObtained}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-500">
                          {m.maxMarks}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded font-mono font-bold text-[11px] bg-zinc-950 text-white">
                            {m.grade}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-700 font-medium">
                          {m.remarks || "Satisfactory progress demonstrated"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-zinc-50 font-bold text-zinc-950 border-t border-zinc-200 font-mono">
                      <td className="py-3 px-4 uppercase text-[11px] tracking-wider font-sans">
                        Cumulative Total
                      </td>
                      <td className="py-3 px-4 text-right text-base text-zinc-950">
                        {totalObtained}
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-600">
                        {totalMax}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {overallPercentage}%
                      </td>
                      <td className="py-3 px-4 text-zinc-500 text-[11px] font-sans">
                        Official Academic Transcript Copy
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AsyncStateWrapper>
  );
}
