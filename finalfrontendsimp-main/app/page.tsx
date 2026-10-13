"use client";

import React from "react";
import Link from "next/link";
import { useMockStore } from "@/lib/mock-store";
import {
  School,
  ArrowRight,
  Shield,
  GraduationCap,
  Users,
  User,
  BookOpen,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

export default function SchoolLandingPage() {
  const { school, notices } = useMockStore();

  const publicNotices = notices.slice(0, 3);

  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-zinc-900 selection:text-white flex flex-col font-sans">
      {/* Top Banner */}
      <div className="bg-zinc-950 text-white text-[11px] font-mono tracking-wider py-2 px-4 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>ACADEMIC YEAR {school.academicYear} • {school.currentTerm.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-4 text-zinc-400 hidden sm:flex">
            <span>WEST CAMPUS</span>
            <span>•</span>
            <span>ACCREDITED K–12</span>
            <span>•</span>
            <Link
              href="/login"
              className="text-white hover:underline flex items-center gap-1 font-semibold"
            >
              Sign In <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & School Name */}
          <Link href="/" className="flex items-center gap-3.5 group">
            <div className="w-11 h-11 rounded-lg bg-zinc-950 text-white flex items-center justify-center font-bold shadow-xs group-hover:bg-zinc-800 transition-colors">
              <School className="w-6 h-6" />
            </div>
            <div>
              <div className="font-serif text-lg sm:text-xl font-bold tracking-tight text-zinc-950 leading-none">
                {school.name.toUpperCase()}
              </div>
              <p className="text-[10px] uppercase font-mono tracking-widest text-zinc-500 mt-1">
                Virtus • Veritas • Sapientia
              </p>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-zinc-600">
            <a href="#about" className="hover:text-zinc-950 transition-colors">
              About
            </a>
            <a href="#academics" className="hover:text-zinc-950 transition-colors">
              Academics
            </a>
            <a href="#leadership" className="hover:text-zinc-950 transition-colors">
              Leadership
            </a>
            <a href="#notices" className="hover:text-zinc-950 transition-colors">
              Bulletins
            </a>
            <a href="#admissions" className="hover:text-zinc-950 transition-colors">
              Admissions
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-md bg-zinc-950 text-white text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-all shadow-sm group"
              id="landing-portal-login-btn"
            >
              <span>Portal Access</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-zinc-200 bg-linear-to-b from-zinc-50/70 via-white to-white py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            {/* Monogram / Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-300 bg-white text-xs font-mono font-medium text-zinc-800 mb-6 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-zinc-900" />
              <span>EST. 1998 • COMPREHENSIVE K–12 PORTAL</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-6xl font-bold tracking-tight text-zinc-950 leading-[1.08] mb-6">
              Educating Minds. Shaping Character. Inspiring the Future.
            </h1>

            <p className="text-lg sm:text-xl text-zinc-600 leading-relaxed font-light mb-8">
              A benchmark institution providing scholarly rigor, ethical mentorship, and personalized academic development for young leaders across the primary and secondary continuum.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-md bg-zinc-950 text-white text-sm font-semibold hover:bg-zinc-800 transition-all shadow-md group"
              >
                <span>Enter Institutional Portal</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#academics"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-md border border-zinc-300 bg-white text-zinc-800 text-sm font-semibold hover:border-zinc-900 hover:bg-zinc-50 transition-colors"
              >
                Explore Curricula
              </a>
            </div>

            {/* Quick Portal Switcher Pills */}
            <div className="mt-10 pt-8 border-t border-zinc-200">
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-3 font-medium">
                Direct Portal Sign In Portways:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <Link
                  href="/login?role=admin"
                  className="p-3 rounded-md border border-zinc-200 bg-white hover:border-zinc-900 hover:shadow-xs transition-all group flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Shield className="w-4 h-4 text-zinc-900" />
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-900">Admin Desk</div>
                    <div className="text-[10px] text-zinc-500 font-mono">Head of School</div>
                  </div>
                </Link>

                <Link
                  href="/login?role=teacher"
                  className="p-3 rounded-md border border-zinc-200 bg-white hover:border-zinc-900 hover:shadow-xs transition-all group flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <GraduationCap className="w-4 h-4 text-zinc-900" />
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-900">Faculty Suite</div>
                    <div className="text-[10px] text-zinc-500 font-mono">Grading & Rolls</div>
                  </div>
                </Link>

                <Link
                  href="/login?role=parent"
                  className="p-3 rounded-md border border-zinc-200 bg-white hover:border-zinc-900 hover:shadow-xs transition-all group flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Users className="w-4 h-4 text-zinc-900" />
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-900">Family Portal</div>
                    <div className="text-[10px] text-zinc-500 font-mono">Guardian View</div>
                  </div>
                </Link>

                <Link
                  href="/login?role=student"
                  className="p-3 rounded-md border border-zinc-200 bg-white hover:border-zinc-900 hover:shadow-xs transition-all group flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <User className="w-4 h-4 text-zinc-900" />
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-900">Student Lounge</div>
                    <div className="text-[10px] text-zinc-500 font-mono">Lucas Miller</div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Institutional Statistics Bar */}
      <section className="border-b border-zinc-200 bg-zinc-950 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="border-l border-zinc-800 pl-6">
              <div className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">150+</div>
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 mt-1">
                Enrolled Scholars
              </div>
            </div>
            <div className="border-l border-zinc-800 pl-6">
              <div className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">15</div>
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 mt-1">
                Distinguished Faculty
              </div>
            </div>
            <div className="border-l border-zinc-800 pl-6">
              <div className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">10:1</div>
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 mt-1">
                Student-Faculty Ratio
              </div>
            </div>
            <div className="border-l border-zinc-800 pl-6">
              <div className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">100%</div>
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 mt-1">
                Collegiate Matriculation
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About & Mission */}
      <section id="about" className="py-20 border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-semibold">
                About The Institution
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 mt-2 mb-6">
                A Legacy of Scholarly Inquiry and Unwavering Integrity.
              </h2>
              <p className="text-zinc-600 leading-relaxed mb-4">
                Founded in 1998, SIMPLEIN International School was established to offer a balanced, rigorous, and character-driven education. We champion intellectual curiosity, empathetic teamwork, and analytical clarity.
              </p>
              <p className="text-zinc-600 leading-relaxed mb-6">
                Our campus features modern science suites, a dedicated research archive, fine arts studios, and athletic arenas designed to support the holistic development of every learner.
              </p>
              <div className="space-y-3 font-medium text-sm text-zinc-800">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-zinc-950 shrink-0" />
                  <span>Dual accreditation with global academic advisory bodies</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-zinc-950 shrink-0" />
                  <span>Individualized academic mentorship plans for all grades</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-zinc-950 shrink-0" />
                  <span>Transparent parent-teacher collaborative digital governance</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-zinc-50 border border-zinc-200 rounded-xl p-8 lg:p-10">
              <h3 className="font-serif text-xl font-bold text-zinc-950 mb-6">
                Institutional Core Pillars
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="border border-zinc-200 bg-white p-5 rounded-lg shadow-2xs">
                  <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center mb-3">
                    <BookOpen className="w-4 h-4 text-zinc-900" />
                  </div>
                  <h4 className="font-bold text-sm text-zinc-900 mb-1">Academic Rigor</h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Challenging curricula designed to foster deep understanding, critical problem-solving, and original research.
                  </p>
                </div>

                <div className="border border-zinc-200 bg-white p-5 rounded-lg shadow-2xs">
                  <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center mb-3">
                    <Shield className="w-4 h-4 text-zinc-900" />
                  </div>
                  <h4 className="font-bold text-sm text-zinc-900 mb-1">Ethical Leadership</h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Cultivating personal responsibility, moral courage, and compassionate civic engagement across all grade levels.
                  </p>
                </div>

                <div className="border border-zinc-200 bg-white p-5 rounded-lg shadow-2xs">
                  <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center mb-3">
                    <Award className="w-4 h-4 text-zinc-900" />
                  </div>
                  <h4 className="font-bold text-sm text-zinc-900 mb-1">Holistic Mentorship</h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Nurturing artistic expression, athletic discipline, and emotional resilience through dedicated advisory pods.
                  </p>
                </div>

                <div className="border border-zinc-200 bg-white p-5 rounded-lg shadow-2xs">
                  <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center mb-3">
                    <Sparkles className="w-4 h-4 text-zinc-900" />
                  </div>
                  <h4 className="font-bold text-sm text-zinc-900 mb-1">Future Literacy</h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Integrating computational reasoning, laboratory scientific method, and global languages from early primary.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Academics Division */}
      <section id="academics" className="py-20 border-b border-zinc-200 bg-zinc-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-semibold">
              Curricular Architecture
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 mt-2">
              Three Tiers of Progressive Mastery
            </h2>
            <p className="text-zinc-600 text-sm mt-3">
              Structured developmental frameworks tailored to each stage of cognitive and emotional growth.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Primary */}
            <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-zinc-900 transition-colors">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-900 border border-zinc-200">
                  Grades 1 – 5
                </span>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-4 mb-3">
                  Primary Foundation
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed mb-6">
                  Establishing foundational literacy, structured numeracy, hands-on scientific observation, visual arts, and social-emotional confidence.
                </p>
                <div className="border-t border-zinc-100 pt-4 space-y-2 text-xs text-zinc-700">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                    <span>Linguistic Immersion & Reading Labs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                    <span>Singapore Math & Conceptual Numeracy</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                    <span>Experiential Science Explorations</span>
                  </div>
                </div>
              </div>
              <div className="mt-8 pt-4 border-t border-zinc-100">
                <span className="text-[11px] font-mono text-zinc-500">Class Head: Sarah Jenkins</span>
              </div>
            </div>

            {/* Middle */}
            <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-zinc-900 transition-colors">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-900 border border-zinc-200">
                  Grades 6 – 8
                </span>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-4 mb-3">
                  Middle Years Academy
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed mb-6">
                  Deepening analytical thinking through structured laboratory experimentation, pre-algebraic systems, World History, and debate.
                </p>
                <div className="border-t border-zinc-100 pt-4 space-y-2 text-xs text-zinc-700">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                    <span>Algebraic Thinking & Geometry</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                    <span>Physics, Chemistry & Biology Labs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                    <span>Rhetoric, Debate & Model UN</span>
                  </div>
                </div>
              </div>
              <div className="mt-8 pt-4 border-t border-zinc-100">
                <span className="text-[11px] font-mono text-zinc-500">STEM Director: Marcus Chen</span>
              </div>
            </div>

            {/* Senior */}
            <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-zinc-900 transition-colors">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-900 border border-zinc-200">
                  Grades 9 – 12
                </span>
                <h3 className="font-serif text-2xl font-bold text-zinc-950 mt-4 mb-3">
                  Senior Secondary
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed mb-6">
                  Pre-collegiate rigor featuring Advanced Placement (AP) electives, independent thesis research, collegiate counseling, and internships.
                </p>
                <div className="border-t border-zinc-100 pt-4 space-y-2 text-xs text-zinc-700">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                    <span>Calculus BC & Advanced Physics</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                    <span>AP Capstone Seminar & Thesis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
                    <span>Global College Matriculation Advising</span>
                  </div>
                </div>
              </div>
              <div className="mt-8 pt-4 border-t border-zinc-100">
                <span className="text-[11px] font-mono text-zinc-500">Dean of Studies: Eleanor Brooks</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Leadership & Principal Welcome */}
      <section id="leadership" className="py-20 border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-zinc-900 text-white rounded-2xl p-8 sm:p-12 lg:p-16 relative overflow-hidden">
            <div className="max-w-3xl">
              <span className="text-xs font-mono uppercase tracking-widest text-zinc-400 font-semibold">
                Message from the Head of School
              </span>
              <h2 className="font-serif text-2xl sm:text-4xl font-bold tracking-tight text-white mt-3 mb-6 leading-tight">
                “We do not merely teach students what to think; we empower them to examine how they think, and who they choose to become.”
              </h2>
              <div className="text-zinc-300 text-sm sm:text-base leading-relaxed space-y-4 mb-8">
                <p>
                  Welcome to SIMPLEIN International School. Our educational standard rests on the conviction that intellectual ambition and moral responsibility must develop hand-in-hand. In an evolving world, true readiness demands not only technical proficiency, but resilience, empathy, and intellectual independence.
                </p>
                <p>
                  Our digital portal connects school administration, teaching staff, families, and scholars in real time, ensuring a unified academic mission. I invite you to explore our community.
                </p>
              </div>

              <div className="flex items-center gap-4 pt-6 border-t border-zinc-800">
                <div className="w-12 h-12 rounded-full bg-white text-zinc-950 font-serif font-bold text-lg flex items-center justify-center">
                  RV
                </div>
                <div>
                  <div className="font-bold text-white text-base">{school.principalName}</div>
                  <div className="text-xs text-zinc-400 font-mono">
                    Head of School & Chief Academic Officer
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live School Bulletins & Notices */}
      <section id="notices" className="py-20 border-b border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-semibold">
                Official Circulars
              </span>
              <h2 className="font-serif text-3xl font-bold tracking-tight text-zinc-950 mt-1">
                Announcements & Campus Bulletins
              </h2>
            </div>
            <Link
              href="/login"
              className="text-xs font-mono font-semibold text-zinc-900 hover:underline flex items-center gap-1 mt-4 sm:mt-0"
            >
              Sign In for Full Notice Board <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {publicNotices.map((notice) => (
              <div
                key={notice.id}
                className="border border-zinc-200 rounded-lg p-6 hover:border-zinc-900 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-3 font-mono">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {notice.publishedDate}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 font-medium uppercase text-[10px]">
                      {notice.audience}
                    </span>
                  </div>
                  <h3 className="font-bold text-zinc-900 text-base mb-2 leading-snug">
                    {notice.title}
                  </h3>
                  <p className="text-xs text-zinc-600 line-clamp-3 leading-relaxed mb-4">
                    {notice.content}
                  </p>
                </div>
                <div className="pt-4 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>By {notice.authorName}</span>
                  <Link
                    href="/login"
                    className="text-zinc-950 font-semibold hover:underline flex items-center gap-0.5"
                  >
                    Read <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Admissions Call to Action */}
      <section id="admissions" className="py-20 bg-zinc-50 border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-2xl mx-auto">
          <div className="w-12 h-12 rounded-xl bg-zinc-950 text-white flex items-center justify-center mx-auto mb-6">
            <School className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 mb-4">
            Admissions for {school.academicYear} Are Now Open
          </h2>
          <p className="text-zinc-600 text-sm leading-relaxed mb-8">
            Experience our vibrant learning community. Applications are evaluated on academic merit, intellectual engagement, and personal character.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login"
              className="w-full sm:w-auto px-6 py-3 rounded-md bg-zinc-950 text-white text-xs sm:text-sm font-semibold hover:bg-zinc-800 transition-colors shadow-sm"
            >
              Sign In to Registered Portal
            </Link>
            <a
              href="mailto:admissions@simplein.edu"
              className="w-full sm:w-auto px-6 py-3 rounded-md border border-zinc-300 bg-white text-zinc-900 text-xs sm:text-sm font-semibold hover:border-zinc-900 hover:bg-zinc-50 transition-colors"
            >
              Inquire with Admissions Office
            </a>
          </div>
        </div>
      </section>

      {/* Institutional Footer */}
      <footer className="bg-zinc-950 text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-zinc-800 text-xs text-zinc-400">
            {/* Col 1 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white font-serif font-bold text-base">
                <School className="w-5 h-5" />
                <span>{school.name.toUpperCase()}</span>
              </div>
              <p className="text-zinc-400 leading-relaxed">
                Empowering scholars with critical discernment, intellectual fortitude, and ethical conscience since 1998.
              </p>
              <div className="pt-2 text-[11px] font-mono text-zinc-500">
                School ID: {school.id}
              </div>
            </div>

            {/* Col 2 */}
            <div>
              <div className="font-mono text-white text-xs uppercase tracking-wider mb-4 font-semibold">
                Portals & Desks
              </div>
              <ul className="space-y-2">
                <li>
                  <Link href="/login?role=admin" className="hover:text-white transition-colors">
                    Administrative Command Center
                  </Link>
                </li>
                <li>
                  <Link href="/login?role=teacher" className="hover:text-white transition-colors">
                    Faculty Assessment & Grading
                  </Link>
                </li>
                <li>
                  <Link href="/login?role=parent" className="hover:text-white transition-colors">
                    Family & Guardian Portal
                  </Link>
                </li>
                <li>
                  <Link href="/login?role=student" className="hover:text-white transition-colors">
                    Student Study Lounge
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 3 */}
            <div>
              <div className="font-mono text-white text-xs uppercase tracking-wider mb-4 font-semibold">
                Academics
              </div>
              <ul className="space-y-2">
                <li>Primary Foundation (Grades 1–5)</li>
                <li>Middle Years Academy (Grades 6–8)</li>
                <li>Senior Honors & AP (Grades 9–12)</li>
                <li>Laboratory Sciences & Robotics</li>
                <li>Fine Arts & Performance Suite</li>
              </ul>
            </div>

            {/* Col 4 */}
            <div>
              <div className="font-mono text-white text-xs uppercase tracking-wider mb-4 font-semibold">
                Contact & Campus
              </div>
              <div className="space-y-2 text-zinc-400">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                  <span>{school.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span>+1 (555) 019-2831</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span>chancellery@simplein.edu</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 font-mono">
            <div>
              © 2026 {school.name}. All institutional rights reserved.
            </div>
            <div className="flex items-center gap-6 mt-4 sm:mt-0">
              <Link href="/login" className="hover:text-white transition-colors">
                System Sign In
              </Link>
              <span>•</span>
              <a href="#about" className="hover:text-white transition-colors">
                Privacy & Governance
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
