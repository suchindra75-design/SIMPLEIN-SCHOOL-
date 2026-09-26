import type { TimetableSlotDto } from "@/lib/services/dto";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Weekly timetable grid (admin/teacher/parent). Rows = days, columns =
 * period indexes present in the data (periods are fully configurable —
 * nothing hard-coded). Cell = subject · teacher · time · room.
 */
export function WeeklyTimetable({ slots }: { slots: TimetableSlotDto[] }) {
  const periodIndexes = [...new Set(slots.map((s) => s.periodIndex))].sort(
    (a, b) => a - b,
  );
  if (periodIndexes.length === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center text-sm text-gray-500">
        No timetable entries yet.
      </div>
    );
  }
  const byCell = new Map<string, TimetableSlotDto>();
  for (const s of slots) {
    byCell.set(`${s.dayOfWeek}:${s.periodIndex}`, s);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-gray-600">
            <th className="py-2 pr-2">Day</th>
            {periodIndexes.map((p) => (
              <th key={p} className="py-2 pr-3">
                Period {p + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, i) => {
            const dayOfWeek = i + 1;
            const hasSlots = slots.some((s) => s.dayOfWeek === dayOfWeek);
            if (!hasSlots) return null;
            return (
              <tr key={day} className="border-b align-top">
                <td className="py-2 pr-2 font-medium">{day}</td>
                {periodIndexes.map((p) => {
                  const slot = byCell.get(`${dayOfWeek}:${p}`);
                  return (
                    <td key={p} className="py-2 pr-3">
                      {slot === undefined ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span>
                          <span className="font-medium">
                            {slot.subjects?.name ?? "—"}
                          </span>
                          <br />
                          <span className="text-xs text-gray-600">
                            {slot.teachers?.displayName ?? "—"} · {slot.startsAt}–
                            {slot.endsAt}
                            {slot.room ? ` · ${slot.room}` : ""}
                          </span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
