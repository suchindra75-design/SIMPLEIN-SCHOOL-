"use client";

import React, { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMockStore } from "@/lib/mock-store";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate } from "@/lib/domain";
import {
  ArrowLeft,
  Award,
  Users,
  CheckCircle,
  TrendingUp,
  Globe,
  Filter,
} from "lucide-react";

export default function ExamResultsPage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params as { id: string };

  const { exams, marks, students, sections, publishExam } = useMockStore();

  const exam = exams.find((e) => e.id === id);

  const [selectedSection, setSelectedSection] = useState<string>("ALL");
  const [selectedSubject, setSelectedSubject] = useState<string>("ALL");
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const examMarks = useMemo(() => {
    return marks.filter((m) => m.examId === id);
  }, [marks, id]);

  const filteredMarks = useMemo(() => {
    return examMarks.filter((m) => {
      const student = students.find((s) => s.id === m.studentId);
      if (!student) return false;
      if (selectedSection !== "ALL" && student.sectionId !== selectedSection) {
        return false;
      }
      if (selectedSubject !== "ALL" && m.subject !== selectedSubject) {
        return false;
      }
      return true;
    });
  }, [examMarks, students, selectedSection, selectedSubject]);

  const averageScore = useMemo(() => {
    if (examMarks.length === 0) return 0;
    const sum = examMarks.reduce((acc, m) => acc + m.marksObtained, 0);
    return Math.round((sum / examMarks.length) * 10) / 10;
  }, [examMarks]);

  const highestScore = useMemo(() => {
    if (examMarks.length === 0) return 0;
    return Math.max(...examMarks.map((m) => m.marksObtained));
  }, [examMarks]);

  const passRate = useMemo(() => {
    if (examMarks.length === 0) return 100;
    const passing = examMarks.filter((m) => m.marksObtained >= 50).length;
    return Math.round((passing / examMarks.length) * 100);
  }, [examMarks]);

  const gradeDistribution = useMemo(() => {
    const counts: Record<string, number> = { "A+": 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const m of examMarks) {
      if (counts[m.grade] !== undefined) counts[m.grade]++;
      else counts[m.grade] = (counts[m.grade] || 0) + 1;
    }
    return counts;
  }, [examMarks]);

  if (!exam) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-semibold text-zinc-800">Exam record not found</p>
        <Link
          href="/admin/exams"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-900 underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Exams
        </Link>
      </div>
    );
  }

  const handlePublish = async () => {
    setPublishing(true);
    await publishExam(exam.id);
    setPublishing(false);
    setPublishSuccess(true);
    setTimeout(() => setPublishSuccess(false), 4000);
  };

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        <div>
          <button
            onClick={() => router.push("/admin/exams")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-950 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Examinations
          </button>
        </div>

        {/* Header Banner */}
        <div className="bg-white rounded-lg border border-zinc-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-zinc-950 font-serif">{exam.title}</h1>
              <StatusBadge status={exam.status} size="sm" />
            </div>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              {exam.term} • Examined: {formatFriendlyDate(exam.startDate)} to{" "}
              {formatFriendlyDate(exam.endDate)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {exam.status === "SUBMITTED" ? (
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded transition-colors shadow-xs disabled:opacity-50"
              >
                <Globe className="w-4 h-4" />
                {publishing ? "Publishing to Portal..." : "Publish Results to Parents"}
              </button>
            ) : exam.status === "PUBLISHED" ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-950 bg-zinc-100 rounded border border-zinc-300 font-mono">
                <CheckCircle className="w-4 h-4 text-zinc-950" />
                Live on Parent Portal
              </div>
            ) : (
              <div className="text-xs text-zinc-400 font-mono">
                Marks entry in progress
              </div>
            )}
          </div>
        </div>

        {publishSuccess && (
          <div className="p-4 rounded bg-zinc-900 text-white text-xs flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-white shrink-0" />
              <span>
                <strong>Results published successfully.</strong> Parents can now view these official grades on their portal report cards.
              </span>
            </div>
          </div>
        )}

        {/* Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard
            label="Class Average"
            value={`${averageScore} / 100`}
            subtext="Combined subject average"
            icon={TrendingUp}
            trend={{ positive: averageScore >= 75, text: "Benchmark Met" }}
          />
          <StatCard
            label="Highest Score"
            value={`${highestScore} / 100`}
            subtext="Top score recorded"
            icon={Award}
          />
          <StatCard
            label="Overall Pass Rate"
            value={`${passRate}%`}
            subtext="Scoring 50% or higher"
            trend={{ positive: passRate >= 90, text: "90% target" }}
          />
          <StatCard
            label="Total Submissions"
            value={examMarks.length}
            subtext="Graded subject entries"
            icon={Users}
          />
        </div>

        {/* Grade Distribution Breakdown */}
        <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs">
          <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono mb-3">
            Institutional Grade Distribution
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            {Object.entries(gradeDistribution).map(([grade, count]) => (
              <div
                key={grade}
                className="p-3 rounded bg-zinc-50 border border-zinc-200 text-center"
              >
                <span className="font-mono font-bold text-zinc-950 text-base block">
                  {grade}
                </span>
                <span className="text-xs text-zinc-500 mt-0.5 block font-mono">
                  {count} students
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Filterable Marks Table */}
        <div className="bg-white rounded-lg border border-zinc-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono">
              Student Marks Register ({filteredMarks.length} entries)
            </h3>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-zinc-400" />
                <select
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="text-xs rounded border border-zinc-200 bg-white py-1 px-2 text-zinc-800 font-mono"
                >
                  <option value="ALL">All Sections</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="text-xs rounded border border-zinc-200 bg-white py-1 px-2 text-zinc-800 font-mono"
              >
                <option value="ALL">All Subjects</option>
                {exam.subjects.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700 font-semibold">
                  <th className="py-2.5 px-4">Student</th>
                  <th className="py-2.5 px-4">Section</th>
                  <th className="py-2.5 px-4">Subject</th>
                  <th className="py-2.5 px-4 text-right">Marks</th>
                  <th className="py-2.5 px-4 text-center">Grade</th>
                  <th className="py-2.5 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredMarks.slice(0, 50).map((m) => {
                  const student = students.find((s) => s.id === m.studentId);
                  return (
                    <tr key={m.id} className="hover:bg-zinc-50/60">
                      <td className="py-2.5 px-4 font-semibold text-zinc-950">
                        {student?.fullName || m.studentId}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-700">
                        {student?.className} - {student?.sectionName}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-800">{m.subject}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-zinc-950">
                        {m.marksObtained} / {m.maxMarks}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-block px-2 py-0.5 rounded bg-zinc-100 text-zinc-950 border border-zinc-300 font-mono font-bold text-[11px]">
                          {m.grade}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-zinc-600">
                        {m.remarks || "Satisfactory"}
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
