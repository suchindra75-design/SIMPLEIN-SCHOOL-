import React from "react";
import Link from "next/link";
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
  Sparkles,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
} from "lucide-react";

export default function SchoolLandingPage() {
  const school = {
    id: "sch-simplein-01",
    name: "SIMPLEIN INTERNATIONAL SCHOOL",
    academicYear: "2026-2027",
    currentTerm: "Term 1",
    principalName: "Dr. Robert Vance",
    address: "400 Campus Parkway, Academic City",
  };

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
              <div className="text-lg sm:text-xl font-bold tracking-tight text-zinc-950 leading-none">
                {school.name}
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
            <a href="#admissions" className="hover:text-zinc-950 transition-colors">
              Admissions
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            <Link
              href="/login?portal=staff"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-zinc-950 text-white text-xs font-semibold hover:bg-zinc-800 transition-all shadow-xs group"
              id="landing-staff-portal-btn"
            >
              <span>Staff Portal</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/login?portal=family"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-zinc-100 text-zinc-900 border border-zinc-200 text-xs font-semibold hover:bg-zinc-200 transition-all shadow-xs group"
              id="landing-family-portal-btn"
            >
              <span>Family Portal</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-zinc-200 bg-linear-to-b from-zinc-50/70 via-white to-white py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-300 bg-white text-xs font-mono font-medium text-zinc-800 mb-6 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-zinc-900" />
              <span>EST. 1998 • COMPREHENSIVE K–12 PORTAL</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-zinc-950 leading-[1.08] mb-6">
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
                  href="/login"
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
                  href="/login"
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
                  href="/login"
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
                  href="/login"
                  className="p-3 rounded-md border border-zinc-200 bg-white hover:border-zinc-900 hover:shadow-xs transition-all group flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <User className="w-4 h-4 text-zinc-900" />
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-900">Student Lounge</div>
                    <div className="text-[10px] text-zinc-500 font-mono">Scholar Terminal</div>
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
              <div className="text-3xl sm:text-4xl font-bold tracking-tight">150+</div>
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 mt-1">
                Enrolled Scholars
              </div>
            </div>
            <div className="border-l border-zinc-800 pl-6">
              <div className="text-3xl sm:text-4xl font-bold tracking-tight">15</div>
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 mt-1">
                Distinguished Faculty
              </div>
            </div>
            <div className="border-l border-zinc-800 pl-6">
              <div className="text-3xl sm:text-4xl font-bold tracking-tight">10:1</div>
              <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 mt-1">
                Student-Faculty Ratio
              </div>
            </div>
            <div className="border-l border-zinc-800 pl-6">
              <div className="text-3xl sm:text-4xl font-bold tracking-tight">100%</div>
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
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 mt-2 mb-6">
                A Legacy of Scholarly Inquiry and Unwavering Integrity.
              </h2>
              <p className="text-zinc-600 leading-relaxed mb-4">
                Founded in 1998, SIMPLEIN International School was established to offer a balanced, rigorous, and character-driven education. We champion intellectual curiosity, empathetic teamwork, and analytical clarity.
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
              <h3 className="text-xl font-bold text-zinc-950 mb-6">
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

      {/* Institutional Footer */}
      <footer className="bg-zinc-950 text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-zinc-800 text-xs text-zinc-400">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <School className="w-5 h-5" />
                <span>{school.name}</span>
              </div>
              <p className="text-zinc-400 leading-relaxed">
                Empowering scholars with critical discernment, intellectual fortitude, and ethical conscience since 1998.
              </p>
            </div>

            <div>
              <div className="font-mono text-white text-xs uppercase tracking-wider mb-4 font-semibold">
                Portals & Desks
              </div>
              <ul className="space-y-2">
                <li>
                  <Link href="/login?portal=staff" className="hover:text-white transition-colors">
                    Administrative Command Center
                  </Link>
                </li>
                <li>
                  <Link href="/login?portal=staff" className="hover:text-white transition-colors">
                    Faculty Assessment & Grading
                  </Link>
                </li>
                <li>
                  <Link href="/login?portal=family" className="hover:text-white transition-colors">
                    Family & Guardian Portal
                  </Link>
                </li>
                <li>
                  <Link href="/login?portal=family" className="hover:text-white transition-colors">
                    Student Study Lounge
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <div className="font-mono text-white text-xs uppercase tracking-wider mb-4 font-semibold">
                Academics
              </div>
              <ul className="space-y-2">
                <li>Primary Foundation (Grades 1–5)</li>
                <li>Middle Years Academy (Grades 6–8)</li>
                <li>Senior Honors & AP (Grades 9–12)</li>
                <li>Laboratory Sciences & Robotics</li>
              </ul>
            </div>

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
