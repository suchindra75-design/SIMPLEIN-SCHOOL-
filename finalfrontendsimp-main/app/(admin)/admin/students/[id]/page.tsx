"use client";

import React, { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMockStore } from "@/lib/mock-store";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { calculateAttendancePercentage, formatFriendlyDate } from "@/lib/domain";
import {
  ArrowLeft,
  CalendarCheck,
  Award,
  Phone,
  Calendar,
  Edit,
  Check,
  X,
} from "lucide-react";

export default function StudentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params as { id: string };

  const { students, attendance, marks, exams, sections, updateStudent } = useMockStore();

  const student = students.find((s) => s.id === id);

  const [activeTab, setActiveTab] = useState<"attendance" | "marks" | "details">("attendance");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    firstName: student?.firstName || "",
    lastName: student?.lastName || "",
    parentName: student?.parentName || "",
    parentPhone: student?.parentPhone || "",
    status: student?.status || ("Active" as "Active" | "Inactive"),
  });
  const [editSuccess, setEditSuccess] = useState(false);

  const studentAttendance = useMemo(() => {
    return attendance
      .filter((a) => a.studentId === id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, id]);

  const studentMarks = useMemo(() => {
    return marks.filter((m) => m.studentId === id);
  }, [marks, id]);

  const attendanceRate = useMemo(() => {
    return calculateAttendancePercentage(studentAttendance);
  }, [studentAttendance]);

  const totalAbsences = useMemo(() => {
    return studentAttendance.filter((a) => a.status === "ABSENT").length;
  }, [studentAttendance]);

  const totalLate = useMemo(() => {
    return studentAttendance.filter((a) => a.status === "LATE").length;
  }, [studentAttendance]);

  const marksAverage = useMemo(() => {
    if (studentMarks.length === 0) return 0;
    const sum = studentMarks.reduce((acc, m) => acc + m.marksObtained, 0);
    return Math.round((sum / studentMarks.length) * 10) / 10;
  }, [studentMarks]);

  if (!student) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-semibold text-zinc-800">Student record not found</p>
        <Link
          href="/admin/students"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-900 underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Student Directory
        </Link>
      </div>
    );
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateStudent(student.id, {
        firstName: editFormData.firstName,
        lastName: editFormData.lastName,
        fullName: `${editFormData.firstName} ${editFormData.lastName}`,
        parentName: editFormData.parentName,
        parentPhone: editFormData.parentPhone,
        status: editFormData.status,
      });
      setEditSuccess(true);
      setTimeout(() => {
        setEditSuccess(false);
        setIsEditModalOpen(false);
      }, 500);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div>
          <button
            onClick={() => router.push("/admin/students")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-950 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Directory
          </button>
        </div>

        {/* Profile Header Card */}
        <div className="bg-white rounded-lg border border-zinc-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded bg-zinc-950 text-white flex items-center justify-center font-bold text-xl font-mono shrink-0">
              {student.firstName[0]}
              {student.lastName[0]}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-zinc-950 font-serif">
                  {student.fullName}
                </h1>
                <StatusBadge status={student.status} size="sm" />
              </div>

              <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500 font-medium flex-wrap">
                <span className="font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-900 border border-zinc-200">
                  Roll: {student.rollNumber}
                </span>
                <span>
                  {student.className} • {student.sectionName}
                </span>
                <span className="font-mono">Enrolled: {formatFriendlyDate(student.enrollmentDate)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditFormData({
                  firstName: student.firstName,
                  lastName: student.lastName,
                  parentName: student.parentName,
                  parentPhone: student.parentPhone,
                  status: student.status,
                });
                setIsEditModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200 rounded transition-colors shadow-xs"
            >
              <Edit className="w-3.5 h-3.5" />
              Edit Record
            </button>
          </div>
        </div>

        {/* Key KPI Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard
            label="Attendance Standing"
            value={`${attendanceRate}%`}
            subtext="Calculated over 25 school days"
            icon={CalendarCheck}
            trend={{
              positive: attendanceRate >= 90,
              text: attendanceRate >= 90 ? "Regular" : "Irregular",
            }}
          />
          <StatCard
            label="Overall Grade Avg"
            value={`${marksAverage}%`}
            subtext="Across all recorded exams"
            icon={Award}
          />
          <StatCard
            label="Recorded Absences"
            value={totalAbsences}
            subtext="Days missed this term"
          />
          <StatCard
            label="Late Arrivals"
            value={totalLate}
            subtext="Recorded transit delays"
          />
        </div>

        {/* Detail Tabs */}
        <div className="bg-white rounded-lg border border-zinc-200 shadow-xs overflow-hidden">
          <div className="flex border-b border-zinc-200 px-4 bg-zinc-50/75">
            <button
              onClick={() => setActiveTab("attendance")}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "attendance"
                  ? "border-zinc-950 text-zinc-950"
                  : "border-transparent text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Attendance History ({studentAttendance.length})
            </button>
            <button
              onClick={() => setActiveTab("marks")}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "marks"
                  ? "border-zinc-950 text-zinc-950"
                  : "border-transparent text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Academic Marks & Assessments ({studentMarks.length})
            </button>
            <button
              onClick={() => setActiveTab("details")}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "details"
                  ? "border-zinc-950 text-zinc-950"
                  : "border-transparent text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Family & Profile
            </button>
          </div>

          <div className="p-5">
            {/* Attendance Tab */}
            {activeTab === "attendance" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700 font-semibold">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Remarks / Notice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {studentAttendance.map((rec) => (
                      <tr key={rec.id} className="hover:bg-zinc-50/60">
                        <td className="py-2.5 px-3 font-mono font-medium text-zinc-900">
                          {formatFriendlyDate(rec.date)}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={rec.status} size="sm" />
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600">
                          {rec.remarks || "Regular session"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Marks Tab */}
            {activeTab === "marks" && (
              <div className="space-y-4">
                {studentMarks.length === 0 ? (
                  <p className="text-xs text-zinc-400">No marks entered yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700 font-semibold">
                          <th className="py-2.5 px-3">Exam Cycle</th>
                          <th className="py-2.5 px-3">Subject</th>
                          <th className="py-2.5 px-3 text-right">Score</th>
                          <th className="py-2.5 px-3 text-center">Grade</th>
                          <th className="py-2.5 px-3">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {studentMarks.map((m) => {
                          const exam = exams.find((e) => e.id === m.examId);
                          return (
                            <tr key={m.id} className="hover:bg-zinc-50/60">
                              <td className="py-2.5 px-3 font-medium text-zinc-950">
                                {exam?.title || m.examId}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-zinc-800">
                                {m.subject}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-950">
                                {m.marksObtained} / {m.maxMarks}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="inline-block px-2 py-0.5 font-bold font-mono rounded bg-zinc-100 text-zinc-900 border border-zinc-200 text-[11px]">
                                  {m.grade}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-zinc-600">
                                {m.remarks || "Satisfactory"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Details Tab */}
            {activeTab === "details" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                <div className="space-y-3 bg-zinc-50 p-4 rounded border border-zinc-200">
                  <h3 className="font-semibold text-zinc-950 font-mono uppercase tracking-wider text-[11px]">
                    Student Information
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Full Name</span>
                      <span className="font-medium text-zinc-900">{student.fullName}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Date of Birth</span>
                      <span className="font-mono text-zinc-900">{student.dob}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Gender</span>
                      <span className="font-medium text-zinc-900">{student.gender}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Class Section</span>
                      <span className="font-medium text-zinc-900">
                        {student.className} - {student.sectionName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 bg-zinc-50 p-4 rounded border border-zinc-200">
                  <h3 className="font-semibold text-zinc-950 font-mono uppercase tracking-wider text-[11px]">
                    Guardian & Contact Details
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Guardian Name</span>
                      <span className="font-medium text-zinc-900">{student.parentName}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Primary Contact Phone</span>
                      <span className="font-mono font-medium text-zinc-900">
                        {student.parentPhone}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Portal Family Account</span>
                      <span className="font-mono font-bold text-zinc-900">{student.parentId}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Edit Student Modal */}
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="bg-white rounded-lg shadow-xl border border-zinc-200 w-full max-w-md overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <h3 className="text-sm font-bold text-zinc-950">
                  Edit Student Information
                </h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdate} className="p-5 space-y-4 text-xs">
                {editSuccess && (
                  <div className="p-2.5 rounded bg-zinc-900 text-white flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Record updated successfully!
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={editFormData.firstName}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, firstName: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={editFormData.lastName}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, lastName: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Guardian Name
                  </label>
                  <input
                    type="text"
                    value={editFormData.parentName}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, parentName: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Guardian Phone
                  </label>
                  <input
                    type="text"
                    value={editFormData.parentPhone}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, parentPhone: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Enrollment Status
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        status: e.target.value as "Active" | "Inactive",
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-3 py-1.5 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 text-white font-semibold"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AsyncStateWrapper>
  );
}
