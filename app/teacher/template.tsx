/** Remounts per navigation so each page gets a subtle entrance transition. */
export default function TeacherTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-transition">{children}</div>;
}
