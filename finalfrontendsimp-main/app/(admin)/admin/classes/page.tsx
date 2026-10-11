"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMockStore } from "@/lib/mock-store";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import {
  Layers,
  Users,
  GraduationCap,
  DoorOpen,
  ArrowRight,
} from "lucide-react";

export default function AdminClassesPage() {
  const { classes, sections, teachers, students } = useMockStore();
  const [selectedClassId, setSelectedClassId] = useState<string>("ALL");

  const filteredClasses =
    selectedClassId === "ALL"
      ? classes
      : classes.filter((c) => c.id === selectedClassId);

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">
              Classes & Sections Management
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Curriculum grade levels, classroom allocations, and class teacher assignments
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-mono">Filter Grade:</span>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="text-xs rounded border border-zinc-200 bg-white py-1.5 px-2.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
            >
              <option value="ALL">All Grades (1–8)</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Classes List */}
        <div className="space-y-6">
          {filteredClasses.map((cls) => {
            const classSections = sections.filter((s) => s.classId === cls.id);
            const classStudents = students.filter((s) =>
              classSections.some((sec) => sec.id === s.sectionId)
            );

            return (
              <div
                key={cls.id}
                className="bg-white rounded-lg border border-zinc-200 shadow-xs overflow-hidden"
              >
                {/* Class Header Banner */}
                <div className="px-5 py-3.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded bg-zinc-900 text-white flex items-center justify-center font-bold text-xs font-mono">
                      {cls.numericLevel}
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-zinc-950 font-serif">{cls.name}</h2>
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {classSections.length} Sections • {classStudents.length} Students Enrolled
                      </span>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-semibold text-zinc-700 bg-white px-2.5 py-1 rounded border border-zinc-200">
                    Grade Level {cls.numericLevel}
                  </span>
                </div>

                {/* Sections Grid */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {classSections.map((sec) => {
                    const secStudents = students.filter((s) => s.sectionId === sec.id);
                    const classTeacher = teachers.find((t) => t.id === sec.classTeacherId);

                    return (
                      <div
                        key={sec.id}
                        className="rounded-md border border-zinc-200 p-4 bg-white hover:border-zinc-900 transition-all space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-bold text-zinc-950 block">
                              Section {sec.name}
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {sec.fullName}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-[10px] font-mono border border-zinc-200">
                            <DoorOpen className="w-3 h-3 text-zinc-400" />
                            {sec.roomNumber}
                          </span>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-zinc-600">
                            <span className="flex items-center gap-1.5">
                              <GraduationCap className="w-3.5 h-3.5 text-zinc-400" />
                              Class Teacher:
                            </span>
                            <span className="font-semibold text-zinc-900">
                              {classTeacher?.name || "Unassigned"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-zinc-600">
                            <span className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-zinc-400" />
                              Enrolled:
                            </span>
                            <span className="font-mono font-bold text-zinc-950">
                              {secStudents.length} / {sec.capacity}
                            </span>
                          </div>

                          <div className="w-full h-1.5 rounded bg-zinc-100 overflow-hidden mt-1">
                            <div
                              className="h-full bg-zinc-900 rounded"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (secStudents.length / sec.capacity) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>

                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between font-mono">
                          <Link
                            href="/admin/students"
                            className="text-[11px] text-zinc-900 hover:underline font-bold inline-flex items-center gap-1"
                          >
                            Students <ArrowRight className="w-3 h-3" />
                          </Link>
                          {classTeacher && (
                            <Link
                              href={`/admin/teachers/${classTeacher.id}`}
                              className="text-[11px] text-zinc-500 hover:text-zinc-900"
                            >
                              Teacher
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AsyncStateWrapper>
  );
}
