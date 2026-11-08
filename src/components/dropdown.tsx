"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Pill, type PillTone } from "./pill";

export type DropdownOption<Value extends string> = { value: Value; label: string; tone?: PillTone };
export function Dropdown<Value extends string>({ id, label, value, options, onChange, disabled = false }: {
  id: string; label: string; value: Value; options: readonly DropdownOption<Value>[];
  onChange: (value: Value) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
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
  function show(index = Math.max(0, selected)) { if (!disabled && options.length) { setActive(index); setOpen(true); } }
  function choose(index: number) {
    const option = options[index];
    if (disabled || !option) return;
    setOpen(false); trigger.current?.focus();
    if (option.value !== value) onChange(option.value);
  }
  function display(option: DropdownOption<Value>) { return option.tone ? <Pill tone={option.tone}>{option.label}</Pill> : <span>{option.label}</span>; }
  return <div ref={root} className="field dropdown" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label id={`${id}-label`} htmlFor={id}>{label}</label>
    <button ref={trigger} id={id} type="button" role="combobox" className="dropdown-trigger" aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined} aria-activedescendant={expanded && options[active] ? `${id}-option-${active}` : undefined} disabled={disabled || !options.length} onClick={() => expanded ? setOpen(false) : show()} onKeyDown={event => {
      if (event.key === "Tab") { setOpen(false); return; }
      if (event.key === "Escape") { if (expanded) { event.preventDefault(); setOpen(false); trigger.current?.focus(); } return; }
      if (["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) event.preventDefault();
      else return;
      if (event.key === "Enter" || event.key === " ") { if (expanded) choose(active); else show(); }
      else if (event.key === "Home") show(0);
      else if (event.key === "End") show(options.length - 1);
      else if (!expanded) show();
      else setActive(index => (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    }}>
      {selected >= 0 ? display(options[selected]) : <span>Select…</span>}<ChevronDown className="ui-icon" aria-hidden="true" />
    </button>
    {expanded && <div ref={list} id={`${id}-list`} className="dropdown-options" role="listbox" aria-label={`${label} options`}>
      {options.map((option, index) => <button key={option.value} id={`${id}-option-${index}`} type="button" role="option" aria-selected={option.value === value} data-active={index === active} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>{display(option)}</button>)}
    </div>}
  </div>;
}
