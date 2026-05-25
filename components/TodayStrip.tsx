import { format, parseISO } from "date-fns";

export type TodayStripProps = {
  offToday: string[];
  holidayToday: { date: string; name: string } | null;
  viewerName: string;
  upcoming: { name: string; start: string }[];
};

export default function TodayStrip({
  offToday,
  holidayToday,
  viewerName,
  upcoming,
}: TodayStripProps) {
  const viewerFirst = viewerName.split(" ")[0];
  const peersOff = offToday.filter((n) => n.split(" ")[0] !== viewerFirst);
  const isYouOff = offToday.length !== peersOff.length;

  // Lime when today itself has activity worth knowing about; neutral otherwise.
  // The dot just signals "is right-now noteworthy?"; the title carries the meaning.
  const hasTodayActivity = !!holidayToday || peersOff.length > 0 || isYouOff;
  const dot = hasTodayActivity ? "bg-brand-accent" : "bg-neutral-300";

  let title = "Everyone's in today";
  let detail = "Nothing on the calendar for today.";

  if (holidayToday) {
    title = "Public holiday";
    detail = holidayToday.name;
  } else if (peersOff.length > 0 || isYouOff) {
    const count = offToday.length;
    title = `${count} ${count === 1 ? "person" : "people"} off today`;
    const parts: string[] = [];
    if (isYouOff) parts.push("you");
    if (peersOff.length > 0) parts.push(peersOff.map((n) => n.split(" ")[0]).join(", "));
    detail = parts.join(" · ");
  } else if (upcoming.length > 0) {
    const next = upcoming[0];
    const nextDate = format(parseISO(next.start), "EEE d MMM");
    const names = upcoming.map((u) => u.name.split(" ")[0]);
    const namesLabel =
      names.length === 1
        ? names[0]
        : names.length === 2
        ? `${names[0]} & ${names[1]}`
        : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
    title = `${upcoming.length} ${upcoming.length === 1 ? "person" : "people"} off in the next 2 weeks`;
    detail = `Up next: ${namesLabel} from ${nextDate}`;
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-3">
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-900">{title}</div>
          <div className="text-xs text-neutral-500 mt-0.5 truncate">{detail}</div>
        </div>
      </div>
    </div>
  );
}
