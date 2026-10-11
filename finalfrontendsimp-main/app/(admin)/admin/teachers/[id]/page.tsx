"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMockStore } from "@/lib/mock-store";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate } from "@/lib/domain";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  Layers,
  Users,
  Edit,
  Check,
  X,
} from "lucide-react";

export default function TeacherProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params as { id: string };

  const { teachers, sections, students, updateTeacher } = useMockStore();

  const teacher = teachers.find((t) => t.id === id);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: teacher?.name || "",
    email: teacher?.email || "",
    phone: teacher?.phone || "",
    specialization: teacher?.specialization.join(", ") || "",
  });
  const [editSuccess, setEditSuccess] = useState(false);

  if (!teacher) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-semibold text-zinc-800">Faculty member not found</p>
        <Link
          href="/admin/teachers"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-900 underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Faculty Directory
        </Link>
      </div>
    );
  }

  const assignedSections = sections.filter((s) =>
    teacher.assignedSectionIds.includes(s.id)
  );

  const teacherStudents = students.filter((s) =>
    teacher.assignedSectionIds.includes(s.sectionId)
  );

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateTeacher(teacher.id, {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      specialization: formData.specialization
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    setEditSuccess(true);
    setTimeout(() => {
      setEditSuccess(false);
      setIsEditModalOpen(false);
    }, 500);
  };

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        <div>
          <button
            onClick={() => router.push("/admin/teachers")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-950 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Faculty Roster
          </button>
        </div>

        {/* Profile Header */}
        <div className="bg-white rounded-lg border border-zinc-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded bg-zinc-950 text-white flex items-center justify-center font-bold text-xl font-mono shrink-0">
              {teacher.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>

            <div>
              <h1 className="text-xl font-bold text-zinc-950 font-serif">{teacher.name}</h1>
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                Faculty Member • Joined {formatFriendlyDate(teacher.joinDate)}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {teacher.specialization.map((subj, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-[11px] font-medium border border-zinc-200"
                  >
                    {subj}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setFormData({
                name: teacher.name,
                email: teacher.email,
                phone: teacher.phone,
                specialization: teacher.specialization.join(", "),
              });
              setIsEditModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200 rounded transition-colors shadow-xs"
          >
            <Edit className="w-3.5 h-3.5" />
            Edit Profile
          </button>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Contact Details */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs space-y-3">
            <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono border-b border-zinc-100 pb-2">
              Contact & Credentials
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-zinc-800">
                <Mail className="w-4 h-4 text-zinc-400" />
                <span>{teacher.email}</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-800 font-mono">
                <Phone className="w-4 h-4 text-zinc-400" />
                <span>{teacher.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-800 font-mono">
                <Calendar className="w-4 h-4 text-zinc-400" />
                <span>Tenure: Since {teacher.joinDate}</span>
              </div>
            </div>
          </div>

          {/* Assigned Class Sections */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs md:col-span-2 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <h2 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono flex items-center gap-2">
                <Layers className="w-4 h-4 text-zinc-800" />
                Assigned Class Sections ({assignedSections.length})
              </h2>
              <span className="text-xs text-zinc-500 font-mono">
                {teacherStudents.length} Students Total
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {assignedSections.map((sec) => {
                const count = students.filter((s) => s.sectionId === sec.id).length;
                return (
                  <div
                    key={sec.id}
                    className="p-3 rounded bg-zinc-50 border border-zinc-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-zinc-950">
                        {sec.fullName}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-zinc-800 border border-zinc-200">
                        {sec.roomNumber}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>Enrolled Students</span>
                      <span className="font-mono font-bold text-zinc-950">
                        {count} / {sec.capacity}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Student Roster under Teacher */}
        <div className="bg-white rounded-lg border border-zinc-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-800" />
              <h3 className="text-xs font-bold text-zinc-950 uppercase tracking-wider font-mono">
                Students in Assigned Sections ({teacherStudents.length})
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700 font-semibold">
                  <th className="py-2.5 px-4">Roll #</th>
                  <th className="py-2.5 px-4">Student Name</th>
                  <th className="py-2.5 px-4">Section</th>
                  <th className="py-2.5 px-4">Guardian</th>
                  <th className="py-2.5 px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {teacherStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50/60">
                    <td className="py-2.5 px-4 font-mono font-bold text-zinc-950">
                      {s.rollNumber}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-zinc-950">
                      {s.fullName}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-700">
                      {s.className} - {s.sectionName}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-700">{s.parentName}</td>
                    <td className="py-2.5 px-4">
                      <Link
                        href={`/admin/students/${s.id}`}
                        className="text-xs text-zinc-950 hover:underline font-bold font-mono"
                      >
                        View Profile →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Modal */}
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="bg-white rounded-lg shadow-xl border border-zinc-200 w-full max-w-md overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <h3 className="text-sm font-bold text-zinc-950">Edit Faculty Profile</h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdate} className="p-5 space-y-3.5 text-xs">
                {editSuccess && (
                  <div className="p-2.5 rounded bg-zinc-900 text-white flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Faculty profile updated!
                  </div>
                )}

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Specializations (comma separated)
                  </label>
                  <input
                    type="text"
                    value={formData.specialization}
                    onChange={(e) =>
                      setFormData({ ...formData, specialization: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
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
