import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Surface, Text } from "@cloudflare/kumo";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { statusLabel } from "@/components/status-badge";

interface CalendarItem {
  id: string;
  status: string;
  scheduled_for: string;
  created_at: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);

  const { data } = useQuery({
    queryKey: ["calendar", start.toISOString(), end.toISOString()],
    queryFn: () => api.get<CalendarItem[]>(`/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}`),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of data ?? []) {
      const day = item.scheduled_for?.slice(0, 10);
      if (day) map.set(day, [...(map.get(day) ?? []), item]);
    }
    return map;
  }, [data]);

  const firstWeekday = (start.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = end.getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const move = (delta: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Your publishing schedule across all connected accounts."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" shape="square" onClick={() => move(-1)} aria-label="Previous month"><CaretLeft size={16} /></Button>
            <Text DANGEROUS_className="w-40 text-center font-medium">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</Text>
            <Button variant="secondary" size="sm" shape="square" onClick={() => move(1)} aria-label="Next month"><CaretRight size={16} /></Button>
          </div>
        }
      />
      <div className="px-6 pb-8">
        <Surface className="overflow-hidden rounded-lg">
          <div className="grid grid-cols-7 border-b border-kumo-line">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-2 py-2 text-[12px] font-medium text-kumo-subtle">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const key = day ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
              const items = day ? byDay.get(key) ?? [] : [];
              return (
                <div key={i} className="min-h-24 border-b border-r border-kumo-line p-1.5 align-top last:border-r-0">
                  {day && (
                    <>
                      <div className="mb-1 text-[12px] text-kumo-subtle mono-nums">{day}</div>
                      <div className="grid gap-1">
                        {items.slice(0, 3).map((item) => (
                          <div key={item.id} className="truncate rounded bg-kumo-tint px-1.5 py-0.5 text-[11px]">
                            {statusLabel(item.status)} · {item.scheduled_for?.slice(11, 16)}
                          </div>
                        ))}
                        {items.length > 3 && <div className="text-[11px] text-kumo-subtle">+{items.length - 3} more</div>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Surface>
      </div>
    </div>
  );
}