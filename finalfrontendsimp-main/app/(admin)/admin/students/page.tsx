"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMockStore } from "@/lib/mock-store";
import { DataTable, Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { calculateAttendancePercentage } from "@/lib/domain";
import { Student } from "@/lib/types";
import { UserPlus, Filter, X, Check } from "lucide-react";

export default function AdminStudentsPage() {
  const router = useRouter();
  const { students, classes, sections, attendance, addStudent } = useMockStore();

  const [selectedClass, setSelectedClass] = useState<string>("ALL");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    gender: "Male" as "Male" | "Female",
    dob: "2016-04-12",
    sectionId: sections[0]?.id || "",
    parentName: "",
    parentPhone: "",
    status: "Active" as "Active" | "Inactive",
  });
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);

  const studentAttendanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of students) {
      const recs = attendance.filter((a) => a.studentId === s.id);
      map.set(s.id, calculateAttendancePercentage(recs));
    }
    return map;
  }, [students, attendance]);

  const filteredStudents = useMemo(() => {
    if (selectedClass === "ALL") return students;
    const matchingSectionIds = sections
      .filter((sec) => sec.className === selectedClass)
      .map((sec) => sec.id);
    return students.filter((s) => matchingSectionIds.includes(s.sectionId));
  }, [students, selectedClass, sections]);

  const columns: Column<Student>[] = [
    {
      key: "rollNumber",
      header: "Roll #",
      sortable: true,
      className: "w-24 font-mono font-bold text-zinc-950",
    },
    {
      key: "fullName",
      header: "Student Name",
      sortable: true,
      render: (s) => (
        <div>
          <span className="font-semibold text-zinc-950 hover:underline block">
            {s.fullName}
          </span>
          <span className="text-[11px] text-zinc-400 font-mono">{s.gender} • DOB: {s.dob}</span>
        </div>
      ),
    },
    {
      key: "className",
      header: "Class & Section",
      sortable: true,
      render: (s) => (
        <span className="font-medium text-zinc-800">
          {s.className} - {s.sectionName}
        </span>
      ),
    },
    {
      key: "parentName",
      header: "Guardian",
      render: (s) => (
        <div>
          <span className="font-medium text-zinc-800 block">{s.parentName}</span>
          <span className="text-[11px] text-zinc-400 font-mono">{s.parentPhone}</span>
        </div>
      ),
    },
    {
      key: "attendanceRate",
      header: "Attendance",
      sortable: true,
      render: (s) => {
        const rate = studentAttendanceMap.get(s.id) ?? 95;
        return (
          <span className="font-mono font-bold text-xs text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
            {rate}%
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (s) => <StatusBadge status={s.status} size="sm" />,
    },
  ];

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setFormError("Student first and last name are required.");
      return;
    }
    if (!formData.parentName.trim()) {
      setFormError("Guardian name is required.");
      return;
    }

    const sec = sections.find((s) => s.id === formData.sectionId) || sections[0];
    const rollSuffix = Math.floor(10 + Math.random() * 89);
    const rollNumber = `${sec.className.replace("Grade ", "")}${sec.name}-${rollSuffix}`;

    try {
      await addStudent({
        rollNumber,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        fullName: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        gender: formData.gender,
        dob: formData.dob,
        sectionId: sec.id,
        className: sec.className,
        sectionName: `Section ${sec.name}`,
        parentId: `par-${Date.now()}`,
        parentName: formData.parentName.trim(),
        parentPhone: formData.parentPhone.trim() || "+1 (555) 000-0000",
        status: formData.status,
        enrollmentDate: new Date().toISOString().split("T")[0],
      });

      setFormSuccess(true);
      setTimeout(() => {
        setIsAddModalOpen(false);
        setFormSuccess(false);
        setFormData({
          firstName: "",
          lastName: "",
          gender: "Male",
          dob: "2016-04-12",
          sectionId: sections[0]?.id || "",
          parentName: "",
          parentPhone: "",
          status: "Active",
        });
      }, 500);
    } catch {
      setFormError("Failed to add student. Please try again.");
    }
  };

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">
              Student Directory
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Active student enrollments, guardian contacts, and attendance standings
            </p>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded transition-colors shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Enroll New Student
          </button>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredStudents}
          searchPlaceholder="Search student name, roll number, or guardian..."
          onRowClick={(student) => router.push(`/admin/students/${student.id}`)}
          pageSize={12}
          filterComponent={
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="text-xs rounded border border-zinc-200 bg-white py-1.5 px-2 text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium font-mono"
              >
                <option value="ALL">All Grades (1–8)</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.name}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
          }
        />

        {/* Add Student Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="bg-white rounded-lg shadow-xl border border-zinc-200 w-full max-w-lg overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-zinc-900" />
                  <h3 className="text-sm font-bold text-zinc-950">
                    Enroll New Student
                  </h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateStudent} className="p-5 space-y-4 text-xs">
                {formError && (
                  <div className="p-2.5 rounded bg-zinc-100 border border-zinc-300 text-zinc-900 text-xs">
                    {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="p-2.5 rounded bg-zinc-900 text-white text-xs flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Student enrolled successfully in mock dataset!
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="e.g. Benjamin"
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="e.g. Hayes"
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      Gender
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          gender: e.target.value as "Male" | "Female",
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={formData.dob}
                      onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Assigned Class & Section *
                  </label>
                  <select
                    value={formData.sectionId}
                    onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    {sections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.fullName} ({sec.roomNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 border-t border-zinc-100">
                  <h4 className="font-semibold text-zinc-900 mb-2">
                    Guardian Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-zinc-700 mb-1">
                        Guardian Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.parentName}
                        onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                        placeholder="e.g. Thomas Hayes"
                        className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-zinc-700 mb-1">
                        Emergency Phone
                      </label>
                      <input
                        type="text"
                        value={formData.parentPhone}
                        onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                        placeholder="+1 (555) 345-6789"
                        className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-3 py-1.5 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 text-white font-semibold shadow-xs"
                  >
                    Save & Enroll Student
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
