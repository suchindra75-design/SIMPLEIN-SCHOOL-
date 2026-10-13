"use client";

import React, { useState } from "react";
import { useMockStore } from "@/lib/mock-store";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate } from "@/lib/domain";
import { NoticeAudience } from "@/lib/types";
import { Megaphone, PlusCircle, AlertCircle, X, Check } from "lucide-react";

export default function AdminNoticesPage() {
  const { notices, school, createNotice } = useMockStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    audience: "ALL" as NoticeAudience,
    isUrgent: false,
  });
  const [success, setSuccess] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) return;

    await createNotice({
      title: formData.title.trim(),
      content: formData.content.trim(),
      audience: formData.audience,
      publishedDate: new Date().toISOString().split("T")[0],
      authorName: `${school.principalName}`,
      isUrgent: formData.isUrgent,
    });

    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setIsCreateModalOpen(false);
      setFormData({
        title: "",
        content: "",
        audience: "ALL",
        isUrgent: false,
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
              Notices & Official Circulars
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Broadcast announcements to faculty, parents, and administrative channels
            </p>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded transition-colors shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Publish New Circular
          </button>
        </div>

        {/* Notices Cards List */}
        <div className="space-y-4">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className={`bg-white rounded-lg border p-5 shadow-xs transition-all ${
                notice.isUrgent ? "border-zinc-950 ring-1 ring-zinc-950" : "border-zinc-200"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {notice.isUrgent && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-950 text-white uppercase">
                      <AlertCircle className="w-3 h-3" />
                      Priority Memo
                    </span>
                  )}
                  <h2 className="text-sm font-bold text-zinc-950 font-serif">{notice.title}</h2>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 font-mono">
                    Audience:
                  </span>
                  <StatusBadge status={notice.audience} size="sm" />
                </div>
              </div>

              <p className="text-xs text-zinc-700 leading-relaxed mt-2 whitespace-pre-line">
                {notice.content}
              </p>

              <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                <span>Issued by: {notice.authorName}</span>
                <span>Date: {formatFriendlyDate(notice.publishedDate)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Create Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="bg-white rounded-lg shadow-xl border border-zinc-200 w-full max-w-lg overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <h3 className="text-sm font-bold text-zinc-950 font-serif">
                  Publish Official Notice
                </h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-5 space-y-4 text-xs">
                {success && (
                  <div className="p-2.5 rounded bg-zinc-900 text-white text-xs flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Notice dispatched to portal circulars!
                  </div>
                )}

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Notice Subject / Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Annual Sports Meet 2026 Registration"
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      Target Audience
                    </label>
                    <select
                      value={formData.audience}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          audience: e.target.value as NoticeAudience,
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                    >
                      <option value="ALL">Entire School Community (All)</option>
                      <option value="TEACHER">Faculty & Teachers Only</option>
                      <option value="PARENT">Parents & Guardians Only</option>
                    </select>
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formData.isUrgent}
                        onChange={(e) =>
                          setFormData({ ...formData, isUrgent: e.target.checked })
                        }
                        className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                      <span className="font-semibold text-zinc-900 text-xs">
                        Mark as Urgent Memo
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Notice Body Content *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Draft the announcement details here..."
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 leading-relaxed"
                  />
                </div>

                <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-3 py-1.5 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 text-white font-semibold shadow-xs"
                  >
                    Publish Circular
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
