"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  AttendanceRecord,
  Exam,
  GradeClass,
  Homework,
  MarkRecord,
  Notice,
  NotificationItem,
  Parent,
  Persona,
  Role,
  School,
  Section,
  Student,
  Teacher,
} from "../types";
import {
  demoPersonas,
  initialAttendance,
  initialClasses,
  initialExams,
  initialHomework,
  initialMarks,
  initialNotices,
  initialNotifications,
  initialParents,
  initialSchool,
  initialSections,
  initialStudents,
  initialTeachers,
} from "../mock-data";

interface MockStoreContextType {
  // Session / Persona
  isAuthenticated: boolean;
  role: Role;
  currentPersona: Persona;
  activeChildId: string;
  activeStudentId: string;
  setRole: (role: Role) => void;
  setPersona: (personaId: string) => void;
  setActiveChildId: (childId: string) => void;
  login: (role: Role, personaId?: string) => Promise<void>;
  logout: () => void;

  // Data
  school: School;
  classes: GradeClass[];
  sections: Section[];
  teachers: Teacher[];
  students: Student[];
  parents: Parent[];
  attendance: AttendanceRecord[];
  exams: Exam[];
  marks: MarkRecord[];
  homework: Homework[];
  notices: Notice[];
  notifications: NotificationItem[];

  // Async Methods
  resetDemoData: () => void;
  simulatedErrorMode: boolean;
  toggleSimulatedError: (val?: boolean) => void;
  addStudent: (data: Omit<Student, "id">) => Promise<Student>;
  updateStudent: (id: string, data: Partial<Student>) => Promise<Student>;
  addTeacher: (data: Omit<Teacher, "id">) => Promise<Teacher>;
  updateTeacher: (id: string, data: Partial<Teacher>) => Promise<Teacher>;
  saveAttendanceBatch: (records: { studentId: string; sectionId: string; date: string; status: AttendanceRecord["status"]; remarks?: string }[]) => Promise<void>;
  saveMarksBatch: (records: { examId: string; studentId: string; subject: string; marksObtained: number; maxMarks: number; grade: string; remarks?: string }[]) => Promise<void>;
  createExam: (data: Omit<Exam, "id">) => Promise<Exam>;
  publishExam: (examId: string) => Promise<void>;
  createNotice: (data: Omit<Notice, "id">) => Promise<Notice>;
  createHomework: (data: Omit<Homework, "id">) => Promise<Homework>;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
}

const MockStoreContext = createContext<MockStoreContextType | null>(null);

const STORAGE_KEY = "simplein_mock_store_v1";

export function MockStoreProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Session State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [role, setRoleState] = useState<Role>("admin");
  const [currentPersona, setCurrentPersona] = useState<Persona>(demoPersonas[0]);
  const [activeChildId, setActiveChildIdState] = useState<string>("stu-sec-5a-01");
  const [activeStudentId, setActiveStudentIdState] = useState<string>("stu-sec-5a-01");

  // Domain Entities State
  const [school, setSchool] = useState<School>(initialSchool);
  const [classes, setClasses] = useState<GradeClass[]>(initialClasses);
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [teachers, setTeachers] = useState<Teacher[]>(initialTeachers);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [parents, setParents] = useState<Parent[]>(initialParents);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance);
  const [exams, setExams] = useState<Exam[]>(initialExams);
  const [marks, setMarks] = useState<MarkRecord[]>(initialMarks);
  const [homework, setHomework] = useState<Homework[]>(initialHomework);
  const [notices, setNotices] = useState<Notice[]>(initialNotices);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [simulatedErrorMode, setSimulatedErrorMode] = useState(false);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.isAuthenticated !== undefined) setIsAuthenticated(parsed.isAuthenticated);
        if (parsed.role) setRoleState(parsed.role);
        if (parsed.personaId) {
          const found = demoPersonas.find((p) => p.id === parsed.personaId);
          if (found) setCurrentPersona(found);
        }
        if (parsed.activeChildId) setActiveChildIdState(parsed.activeChildId);
        if (parsed.activeStudentId) setActiveStudentIdState(parsed.activeStudentId);
        if (parsed.school) setSchool(parsed.school);
        if (parsed.classes) setClasses(parsed.classes);
        if (parsed.sections) setSections(parsed.sections);
        if (parsed.teachers) setTeachers(parsed.teachers);
        if (parsed.students) setStudents(parsed.students);
        if (parsed.parents) setParents(parsed.parents);
        if (parsed.attendance) setAttendance(parsed.attendance);
        if (parsed.exams) setExams(parsed.exams);
        if (parsed.marks) setMarks(parsed.marks);
        if (parsed.homework) setHomework(parsed.homework);
        if (parsed.notices) setNotices(parsed.notices);
        if (parsed.notifications) setNotifications(parsed.notifications);
      }
    } catch (e) {
      console.warn("Could not load from localStorage:", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Sync to localStorage on meaningful state changes
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const payload = {
        isAuthenticated,
        role,
        personaId: currentPersona.id,
        activeChildId,
        activeStudentId,
        school,
        classes,
        sections,
        teachers,
        students,
        parents,
        attendance,
        exams,
        marks,
        homework,
        notices,
        notifications,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  }, [
    isLoaded,
    isAuthenticated,
    role,
    currentPersona,
    activeChildId,
    activeStudentId,
    school,
    classes,
    sections,
    teachers,
    students,
    parents,
    attendance,
    exams,
    marks,
    homework,
    notices,
    notifications,
  ]);

  const setRole = (newRole: Role) => {
    setRoleState(newRole);
    const persona = demoPersonas.find((p) => p.role === newRole) || demoPersonas[0];
    setCurrentPersona(persona);
    if (newRole === "parent") {
      setActiveChildIdState("stu-sec-5a-01");
    }
    if (newRole === "student") {
      setActiveStudentIdState("stu-sec-5a-01");
    }
  };

  const setPersona = (personaId: string) => {
    const found = demoPersonas.find((p) => p.id === personaId);
    if (found) {
      setCurrentPersona(found);
      setRoleState(found.role);
      if (found.role === "parent") {
        setActiveChildIdState("stu-sec-5a-01");
      }
      if (found.role === "student") {
        setActiveStudentIdState("stu-sec-5a-01");
      }
    }
  };

  const setActiveChildId = (childId: string) => {
    setActiveChildIdState(childId);
  };

  const login = async (newRole: Role, personaId?: string): Promise<void> => {
    await delay(120);
    const targetPersona = personaId
      ? demoPersonas.find((p) => p.id === personaId)
      : demoPersonas.find((p) => p.role === newRole);
    const selected = targetPersona || demoPersonas[0];
    setRoleState(selected.role);
    setCurrentPersona(selected);
    setIsAuthenticated(true);
    if (selected.role === "parent") setActiveChildIdState("stu-sec-5a-01");
    if (selected.role === "student") setActiveStudentIdState("stu-sec-5a-01");
  };

  const logout = () => {
    setIsAuthenticated(false);
  };

  const resetDemoData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsAuthenticated(true);
    setRoleState("admin");
    setCurrentPersona(demoPersonas[0]);
    setActiveChildIdState("stu-sec-5a-01");
    setActiveStudentIdState("stu-sec-5a-01");
    setSchool(initialSchool);
    setClasses(initialClasses);
    setSections(initialSections);
    setTeachers(initialTeachers);
    setStudents(initialStudents);
    setParents(initialParents);
    setAttendance(initialAttendance);
    setExams(initialExams);
    setMarks(initialMarks);
    setHomework(initialHomework);
    setNotices(initialNotices);
    setNotifications(initialNotifications);
    setSimulatedErrorMode(false);
  };

  const toggleSimulatedError = (val?: boolean) => {
    setSimulatedErrorMode((prev) => (val !== undefined ? val : !prev));
  };

  // Async helper to simulate realistic ~150-250ms operational response
  const delay = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));

  const addStudent = async (data: Omit<Student, "id">): Promise<Student> => {
    await delay();
    const newStudent: Student = {
      ...data,
      id: `stu-${Date.now()}`,
    };
    setStudents((prev) => [newStudent, ...prev]);
    return newStudent;
  };

  const updateStudent = async (id: string, data: Partial<Student>): Promise<Student> => {
    await delay();
    let updated: Student | null = null;
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          updated = { ...s, ...data };
          return updated;
        }
        return s;
      })
    );
    if (!updated) throw new Error("Student not found");
    return updated;
  };

  const addTeacher = async (data: Omit<Teacher, "id">): Promise<Teacher> => {
    await delay();
    const newTeacher: Teacher = {
      ...data,
      id: `tea-${Date.now()}`,
    };
    setTeachers((prev) => [newTeacher, ...prev]);
    return newTeacher;
  };

  const updateTeacher = async (id: string, data: Partial<Teacher>): Promise<Teacher> => {
    await delay();
    let updated: Teacher | null = null;
    setTeachers((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          updated = { ...t, ...data };
          return updated;
        }
        return t;
      })
    );
    if (!updated) throw new Error("Teacher not found");
    return updated;
  };

  const saveAttendanceBatch = async (
    records: { studentId: string; sectionId: string; date: string; status: AttendanceRecord["status"]; remarks?: string }[]
  ): Promise<void> => {
    await delay();
    setAttendance((prev) => {
      const updated = [...prev];
      for (const rec of records) {
        const existingIdx = updated.findIndex((r) => r.studentId === rec.studentId && r.date === rec.date);
        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            status: rec.status,
            remarks: rec.remarks,
          };
        } else {
          updated.push({
            id: `att-${rec.studentId}-${rec.date}`,
            studentId: rec.studentId,
            sectionId: rec.sectionId,
            date: rec.date,
            status: rec.status,
            remarks: rec.remarks,
          });
        }
      }
      return updated;
    });
  };

  const saveMarksBatch = async (
    records: { examId: string; studentId: string; subject: string; marksObtained: number; maxMarks: number; grade: string; remarks?: string }[]
  ): Promise<void> => {
    await delay();
    setMarks((prev) => {
      const updated = [...prev];
      for (const rec of records) {
        const existingIdx = updated.findIndex(
          (m) => m.examId === rec.examId && m.studentId === rec.studentId && m.subject === rec.subject
        );
        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            marksObtained: rec.marksObtained,
            grade: rec.grade,
            remarks: rec.remarks,
          };
        } else {
          updated.push({
            id: `mrk-${rec.examId}-${rec.studentId}-${rec.subject.toLowerCase().replace(/\s+/g, "-")}`,
            ...rec,
          });
        }
      }
      return updated;
    });
  };

  const createExam = async (data: Omit<Exam, "id">): Promise<Exam> => {
    await delay();
    const newExam: Exam = {
      ...data,
      id: `exam-${Date.now()}`,
    };
    setExams((prev) => [newExam, ...prev]);
    return newExam;
  };

  const publishExam = async (examId: string): Promise<void> => {
    await delay();
    setExams((prev) =>
      prev.map((e) => {
        if (e.id === examId) {
          return {
            ...e,
            status: "PUBLISHED" as const,
            publishedAt: new Date().toISOString(),
          };
        }
        return e;
      })
    );
    // Add notification
    const newNotice: NotificationItem = {
      id: `ntf-${Date.now()}`,
      title: "Exam Results Published",
      message: `Results have been reviewed and published for student reports.`,
      timestamp: "Just now",
      read: false,
      targetRole: "ALL",
      type: "exam",
    };
    setNotifications((prev) => [newNotice, ...prev]);
  };

  const createNotice = async (data: Omit<Notice, "id">): Promise<Notice> => {
    await delay();
    const newNotice: Notice = {
      ...data,
      id: `not-${Date.now()}`,
    };
    setNotices((prev) => [newNotice, ...prev]);
    return newNotice;
  };

  const createHomework = async (data: Omit<Homework, "id">): Promise<Homework> => {
    await delay();
    const newHw: Homework = {
      ...data,
      id: `hw-${Date.now()}`,
    };
    setHomework((prev) => [newHw, ...prev]);
    return newHw;
  };

  const markNotificationAsRead = async (id: string): Promise<void> => {
    await delay(50);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllNotificationsAsRead = async (): Promise<void> => {
    await delay(80);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <MockStoreContext.Provider
      value={{
        isAuthenticated,
        role,
        currentPersona,
        activeChildId,
        activeStudentId,
        setRole,
        setPersona,
        setActiveChildId,
        login,
        logout,
        school,
        classes,
        sections,
        teachers,
        students,
        parents,
        attendance,
        exams,
        marks,
        homework,
        notices,
        notifications,
        resetDemoData,
        simulatedErrorMode,
        toggleSimulatedError,
        addStudent,
        updateStudent,
        addTeacher,
        updateTeacher,
        saveAttendanceBatch,
        saveMarksBatch,
        createExam,
        publishExam,
        createNotice,
        createHomework,
        markNotificationAsRead,
        markAllNotificationsAsRead,
      }}
    >
      {children}
    </MockStoreContext.Provider>
  );
}

export function useMockStore() {
  const context = useContext(MockStoreContext);
  if (!context) {
    throw new Error("useMockStore must be used within a MockStoreProvider");
  }
  return context;
}
