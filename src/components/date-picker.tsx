"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DayPicker, useDayPicker, type ChevronProps, type DropdownProps } from "@daypicker/react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

// Calendar-only dates: avoid UTC serialization and the constructor's 0–99 year remapping.
function parseDate(text: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return;
  const [year, month, day] = text.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day); date.setHours(12, 0, 0, 0);
  if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
}
function dateText(date: Date) { return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
const firstMonth = parseDate("0001-01-01")!;
const lastMonth = parseDate("9999-12-31")!;
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fullDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "full" });
function CalendarChevron({ orientation }: ChevronProps) {
  const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown;
  return <Icon className="ui-icon" aria-hidden="true" />;
}
// A year entry keeps navigation fast across the full range without 9,999 option nodes.
function CalendarYear({ value, disabled }: DropdownProps) {
  const { months, goToMonth } = useDayPicker();
  function navigate(input: HTMLInputElement) {
    const year = Number(input.value);
    if (/^\d{1,4}$/.test(input.value) && year >= 1 && year <= 9999) {
      const next = new Date(months[0].date); next.setFullYear(year); goToMonth(next);
    } else input.value = String(value).padStart(4, "0");
  }
  return <input key={String(value)} className="calendar-year" aria-label="Calendar year" title="Enter a year from 1 to 9999" type="text" inputMode="numeric" autoComplete="off" maxLength={4} defaultValue={String(value).padStart(4, "0")} disabled={disabled} onBlur={event => navigate(event.currentTarget)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); navigate(event.currentTarget); } }} />;
}
export function DatePicker({ id, label, value, onChange, disabled = false, form }: {
  id: string; label: string; value: string | null; onChange: (date: string | null) => void; disabled?: boolean; form?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => parseDate(value ?? "") ?? new Date());
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [position, setPosition] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const expanded = open && !disabled;
  const selected = parseDate(value ?? "");
  if (disabled && open) setOpen(false);
  function place() {
    const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - Math.min(332, window.innerWidth - 32) - 16));
    // Shift into the viewport when neither side can fit the whole calendar.
    // Short screens scroll the popup instead of clipping its navigation/actions.
    if (Math.max(above, below) < 510) {
      setPosition({ left, top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 526)), maxHeight: Math.max(0, window.innerHeight - 32) });
    } else {
      const useAbove = below < 510 && above > below;
      setPosition({ left, maxHeight: Math.max(0, useAbove ? above : below), ...(useAbove ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }) });
    }
  }
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", outside); window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", resize); };
  }, [expanded]);
  function close() { setOpen(false); trigger.current?.focus(); }
  function show() { if (disabled) return; setPending(value ?? ""); setError(""); setMonth(selected ?? new Date()); place(); setOpen(true); }
  function commit(next: string | null) {
    if (disabled) return;
    if (next !== null && !parseDate(next)) return;
    close(); if (next !== value) onChange(next);
  }
  function apply() {
    if (!parseDate(pending)) { setError("Enter a valid date as YYYY-MM-DD (years 0001–9999)."); return; }
    commit(pending);
  }
  return <div ref={root} className="field date-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
    if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <label id={`${id}-label`} htmlFor={id}>{label}</label>
    <button ref={trigger} id={id} form={form} type="button" className="date-picker-trigger" aria-labelledby={`${id}-label`} aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? `${id}-calendar` : undefined} disabled={disabled} onClick={() => expanded ? close() : show()}>
      <span className={selected ? "" : "muted"}>{selected ? shortDate.format(selected) : "Unscheduled"}</span><CalendarDays className="ui-icon" aria-hidden="true" />
    </button>
    {expanded && <div ref={popup} id={`${id}-calendar`} className="date-picker-popover" role="dialog" aria-label={`${label} calendar`} style={position}>
      <DayPicker mode="single" required selected={selected} onSelect={date => commit(dateText(date))} month={month} onMonthChange={setMonth} startMonth={firstMonth} endMonth={lastMonth} captionLayout="dropdown" navLayout="around" autoFocus fixedWeeks labels={{ labelDayButton: date => fullDate.format(date), labelNext: () => "Next month", labelPrevious: () => "Previous month", labelMonthDropdown: () => "Calendar month", labelYearDropdown: () => "Calendar year" }} components={{ Chevron: CalendarChevron, YearsDropdown: CalendarYear }} />
      <div className="date-picker-shortcuts"><Button type="button" className="secondary" onClick={() => commit(dateText(new Date()))}>Today</Button><Button type="button" className="secondary" onClick={() => commit(null)}>Clear date</Button></div>
      <div className="date-picker-exact">
        <label htmlFor={`${id}-exact`}>Exact date</label>
        <div className="date-picker-entry"><input id={`${id}-exact`} type="text" inputMode="numeric" autoComplete="off" maxLength={32} placeholder="YYYY-MM-DD" value={pending} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setPending(event.target.value); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); apply(); } }} /><Button type="button" onClick={apply}>Apply date</Button></div>
        {error && <p id={`${id}-error`} className="date-picker-error" role="alert">{error}</p>}
      </div>
    </div>}
  </div>;
}
