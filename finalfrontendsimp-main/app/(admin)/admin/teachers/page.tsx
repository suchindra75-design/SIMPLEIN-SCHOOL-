"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMockStore } from "@/lib/mock-store";
import { DataTable, Column } from "@/components/shared/DataTable";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { Teacher } from "@/lib/types";
import { UserPlus, Mail, Phone, X, Check } from "lucide-react";

export default function AdminTeachersPage() {
  const router = useRouter();
  const { teachers, sections, addTeacher } = useMockStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    specialization: "",
    assignedSectionId: sections[0]?.id || "",
  });
  const [formSuccess, setFormSuccess] = useState(false);

  const columns: Column<Teacher>[] = [
    {
      key: "name",
      header: "Faculty Name",
      sortable: true,
      render: (t) => (
        <div>
          <span className="font-semibold text-zinc-950 hover:underline block">
            {t.name}
          </span>
          <span className="text-[11px] text-zinc-400 font-mono">Joined {t.joinDate}</span>
        </div>
      ),
    },
    {
      key: "specialization",
      header: "Subject Focus",
      render: (t) => (
        <div className="flex flex-wrap gap-1">
          {t.specialization.map((subj, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-[11px] font-medium border border-zinc-200"
            >
              {subj}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "assignedSectionIds",
      header: "Assigned Sections",
      render: (t) => {
        const assignedSecs = sections.filter((s) => t.assignedSectionIds.includes(s.id));
        return (
          <div className="text-xs text-zinc-800 font-medium">
            {assignedSecs.length === 0
              ? "General Faculty"
              : assignedSecs.map((s) => s.fullName).join(", ")}
          </div>
        );
      },
    },
    {
      key: "contact",
      header: "Contact Details",
      render: (t) => (
        <div className="text-xs space-y-0.5">
          <div className="flex items-center gap-1.5 text-zinc-800">
            <Mail className="w-3 h-3 text-zinc-400" />
            <span>{t.email}</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-500 font-mono text-[11px]">
            <Phone className="w-3 h-3 text-zinc-400" />
            <span>{t.phone}</span>
          </div>
        </div>
      ),
    },
  ];

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) return;

    await addTeacher({
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim() || "+1 (555) 234-9999",
      specialization: formData.specialization
        ? formData.specialization.split(",").map((s) => s.trim())
        : ["General Studies"],
      assignedSectionIds: formData.assignedSectionId ? [formData.assignedSectionId] : [],
      joinDate: new Date().toISOString().split("T")[0],
    });

    setFormSuccess(true);
    setTimeout(() => {
      setIsAddModalOpen(false);
      setFormSuccess(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        specialization: "",
        assignedSectionId: sections[0]?.id || "",
      });
    }, 500);
  };

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">
              Faculty & Staff Directory
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Active teachers, subject assignments, and section head roles
            </p>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded transition-colors shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Faculty Member
          </button>
        </div>

        <DataTable
          columns={columns}
          data={teachers}
          searchPlaceholder="Search faculty by name, subject, or email..."
          onRowClick={(teacher) => router.push(`/admin/teachers/${teacher.id}`)}
          pageSize={10}
        />

        {/* Add Teacher Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="bg-white rounded-lg shadow-xl border border-zinc-200 w-full max-w-md overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <h3 className="text-sm font-bold text-zinc-950">
                  Add Faculty Member
                </h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateTeacher} className="p-5 space-y-3.5 text-xs">
                {formSuccess && (
                  <div className="p-2.5 rounded bg-zinc-900 text-white flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Faculty profile registered!
                  </div>
                )}

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Dr. Catherine Hall"
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Institutional Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="c.hall@simplein.edu"
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 234-8899"
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
                    placeholder="e.g. Chemistry, Advanced Physics"
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Primary Assigned Section
                  </label>
                  <select
                    value={formData.assignedSectionId}
                    onChange={(e) =>
                      setFormData({ ...formData, assignedSectionId: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="">None / Departmental</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-3 py-1.5 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 text-white font-semibold"
                  >
                    Register Faculty Member
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
