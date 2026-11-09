"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Pill, type PillTone } from "./pill";

export type DropdownOption<Value extends string> = { value: Value; label: string; tone?: PillTone };
export function Dropdown<Value extends string>({ id, label, value, options, onChange, disabled = false, fitOptions = false, compact = false }: {
  id: string; label: string; value: Value; options: readonly DropdownOption<Value>[];
  onChange: (value: Value) => void; disabled?: boolean; fitOptions?: boolean; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef<{ prefix: string; time: number } | null>(null);
  const selected = options.findIndex(option => option.value === value);
  const expanded = open && !disabled && options.length > 0;
  if (disabled && open) setOpen(false);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded]);
  useEffect(() => { if (expanded) list.current?.children[active]?.scrollIntoView({ block: "nearest" }); }, [active, expanded]);
  useLayoutEffect(() => {
    const menu = list.current;
    const anchor = trigger.current;
    if (!compact || !expanded || !menu || !anchor) return;
    const position = () => {
      const { clientWidth, clientHeight } = document.documentElement;
      const bounds = anchor.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= clientHeight || bounds.right <= 0 || bounds.left >= clientWidth) {
        setOpen(false);
        return;
      }
      const width = Math.min(Math.max(bounds.width, 160), clientWidth - 16);
      const below = clientHeight - bounds.bottom - 12;
      const above = bounds.top - 12;
      const openAbove = below < 240 && above > below;
      Object.assign(menu.style, {
        width: `${width}px`, left: `${Math.max(8, Math.min(bounds.left, clientWidth - width - 8))}px`,
        top: openAbove ? "auto" : `${bounds.bottom + 4}px`,
        bottom: openAbove ? `${clientHeight - bounds.top + 4}px` : "auto",
        maxHeight: `${Math.min(240, openAbove ? above : below)}px`,
      });
    };
    const reposition = (event: Event) => {
      if (!(event.target instanceof Node) || !menu.contains(event.target)) position();
    };
    position();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [compact, expanded]);
  function show(index = Math.max(0, selected)) {
    if (disabled || !options.length) return;
    typed.current = null;
    setActive(index);
    setOpen(true);
  }
  function jumpToMatch(key: string, time: number) {
    const letter = key.toLowerCase();
    const previous = typed.current;
    const prefix = expanded && previous && time - previous.time < 650 ? previous.prefix : "";
    const search = prefix === letter ? letter : prefix + letter;
    const start = search.length === 1 ? (expanded ? active : selected) + 1 : 0;
    for (let offset = 0; offset < options.length; offset++) {
      const index = (start + offset) % options.length;
      if (options[index].label.toLowerCase().startsWith(search)) {
        show(index);
        break;
      }
    }
    typed.current = { prefix: search, time };
  }
  function choose(index: number) {
    const option = options[index];
    if (disabled || !option) return;
    setOpen(false); trigger.current?.focus();
    if (option.value !== value) onChange(option.value);
  }
  function display(option: DropdownOption<Value>) { return option.tone ? <Pill tone={option.tone}>{option.label}</Pill> : <span>{option.label}</span>; }
  return <div ref={root} className={`field dropdown${fitOptions ? " dropdown-fit" : ""}${compact ? " dropdown-compact" : ""}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    {!compact && <label id={`${id}-label`} htmlFor={id}>{label}</label>}
    <button ref={trigger} id={id} type="button" role="combobox" className="dropdown-trigger" aria-label={compact ? label : undefined} aria-labelledby={compact ? undefined : `${id}-label`} aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined} aria-activedescendant={expanded && options[active] ? `${id}-option-${active}` : undefined} disabled={!options.length || (!compact && disabled)} aria-disabled={compact && disabled || undefined} onClick={() => expanded ? setOpen(false) : show()} onKeyDown={event => {
      if (disabled) return;
      if (event.key === "Tab") { setOpen(false); return; }
      if (event.key === "Escape") { if (expanded) { event.preventDefault(); setOpen(false); trigger.current?.focus(); } return; }
      if (event.key.length === 1 && event.key !== " " && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        jumpToMatch(event.key, event.timeStamp);
        return;
      }
      if (["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) event.preventDefault();
      else return;
      typed.current = null;
      if (event.key === "Enter" || event.key === " ") { if (expanded) choose(active); else show(); }
      else if (event.key === "Home") show(0);
      else if (event.key === "End") show(options.length - 1);
      else if (!expanded) show();
      else setActive(index => (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    }}>
      {selected >= 0 ? display(options[selected]) : <span>Select…</span>}<ChevronDown className="ui-icon" aria-hidden="true" />
    </button>
    {fitOptions && <div className="dropdown-width" aria-hidden="true">
      {options.map(option => <span key={option.value}>{display(option)}</span>)}
    </div>}
    {expanded && <div ref={list} id={`${id}-list`} className="dropdown-options" role="listbox" aria-label={`${label} options`}>
      {options.map((option, index) => <button key={option.value} id={`${id}-option-${index}`} type="button" role="option" aria-selected={option.value === value} data-active={index === active} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>{display(option)}</button>)}
    </div>}
  </div>;
}
