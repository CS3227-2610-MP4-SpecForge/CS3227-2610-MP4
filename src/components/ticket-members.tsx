"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { TicketMember } from "@/delivery";
import { api, failureMessage } from "./http";
import { Button, Notice } from "./ui";

type MemberPage = { members: TicketMember[]; selected_members: TicketMember[]; next_cursor: string | null };
const assigneeLimit = 5;

export function TicketMembers({ organisationId, selected, onChange, disabled = false, onMembers }: { organisationId: string; selected?: string[]; onChange?: (ids: string[]) => void; disabled?: boolean; onMembers?: (members: TicketMember[]) => void }) {
  const [page, setPage] = useState<MemberPage>({ members: [], selected_members: [], next_cursor: null });
  const [identities, setIdentities] = useState<TicketMember[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const paging = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const path = `/api/organisations/${organisationId}/ticket-members`;
  const selectedKey = (selected ?? []).join(",");
  const editing = Boolean(onChange);
  const directory = selected === undefined && !editing;
  useEffect(() => {
    if (!editing && !directory) return;
    let current = true;
    const timer = window.setTimeout(() => {
      api(`${path}?search=${encodeURIComponent(search)}`).then((result: MemberPage) => {
        if (current) { setPage(result); setError(""); }
      }).catch(failure => { if (current) setError(failureMessage(failure)); })
        .finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [path, search, reload, editing, directory]);
  useEffect(() => { onMembers?.(page.members); }, [page.members, onMembers]);
  useEffect(() => {
    if (!selectedKey) return;
    let current = true;
    api(`${path}?selected=${selectedKey}`).then((result: MemberPage) => {
      if (current) { setIdentities(result.selected_members); setIdentityError(""); }
    }).catch(failure => { if (current) setIdentityError(failureMessage(failure)); });
    return () => { current = false; };
  }, [path, selectedKey, reload]);
  const options = page.members.filter(member => !selected?.includes(member.user_id));
  const selectedCount = selected?.length ?? 0;
  const full = selectedCount >= assigneeLimit;
  const expanded = open && !disabled && !full;
  useEffect(() => {
    if (expanded && activeIndex >= 0) list.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, expanded]);
  function retry() { generation.current++; paging.current = false; setLoading(true); setPage({ members: [], selected_members: [], next_cursor: null }); setActiveIndex(-1); setReload(n => n + 1); }
  function query(value: string) {
    generation.current++; paging.current = false; setSearch(value); setLoading(true); setError("");
    setPage({ members: [], selected_members: [], next_cursor: null }); setActiveIndex(-1); setOpen(true);
  }
  function choose(member: TicketMember) {
    if (!onChange || disabled || full || selected?.includes(member.user_id)) return;
    setIdentities(existing => [...existing.filter(old => old.user_id !== member.user_id), member]);
    onChange([...(selected ?? []), member.user_id]);
    if (search) query("");
    else { setActiveIndex(-1); setOpen(true); }
    input.current?.focus();
  }
  async function more() {
    if (loading || paging.current || !page.next_cursor) return;
    const version = generation.current; paging.current = true; setLoading(true);
    try {
      const result: MemberPage = await api(`${path}?after=${page.next_cursor}&search=${encodeURIComponent(search)}`);
      if (generation.current !== version) return;
      setPage(existing => ({ ...result, members: [...existing.members, ...result.members.filter(member => !existing.members.some(old => old.user_id === member.user_id))] })); setError("");
    } catch (failure) { if (generation.current === version) setError(failureMessage(failure)); }
    finally { if (generation.current === version) { paging.current = false; setLoading(false); } }
  }
  function label(userId: string) { return identities.find(member => member.user_id === userId)?.email ?? "Assignee unavailable"; }
  if (directory) return <div className="stack member-picker">
    {loading && <p role="status">Loading members…</p>}
    {error && <><Notice danger>{error}</Notice><Button type="button" className="secondary" onClick={retry}>Retry member list</Button></>}
    {page.next_cursor && <Button type="button" className="secondary" disabled={loading || disabled} onClick={more}>Load more members</Button>}
  </div>;
  if (!onChange) return <div className="field"><span className="field-label">Assignees</span><span className="field-value">{selected?.length ? selected.map(label).join(", ") : "Unassigned"}</span>{selectedKey && identityError && <><Notice danger>{identityError}</Notice><Button type="button" className="secondary" onClick={retry}>Retry assignee emails</Button></>}</div>;
  return <div className="field assignee-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActiveIndex(-1); } }}>
    <div className="assignee-label">
      <label htmlFor={id}>Assignees</label>
      <span className="hint" id={`${id}-count`}>({selectedCount}/{assigneeLimit})</span>
    </div>
    <div className="assignee-box" onClick={() => { if (!disabled) input.current?.focus(); }}>
      {selected?.map(userId => <span className="assignee-chip" key={userId}><span>{label(userId)}</span><button type="button" disabled={disabled} aria-label={`Remove ${label(userId)}`} onClick={event => { event.stopPropagation(); onChange(selected.filter(value => value !== userId)); input.current?.focus(); }}>×</button></span>)}
      <input ref={input} id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined} aria-activedescendant={expanded && options[activeIndex] ? `${id}-option-${activeIndex}` : undefined} aria-describedby={`${id}-count`} placeholder={full ? "Five assignees selected" : "Type an email…"} maxLength={160} value={search} disabled={disabled} onFocus={() => setOpen(true)} onChange={event => query(event.target.value)} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActiveIndex(-1); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); if (!loading && options.length) setActiveIndex(index => event.key === "ArrowDown" ? (index + 1) % options.length : (index <= 0 ? options.length : index) - 1); }
        else if (event.key === "Enter") { event.preventDefault(); if (expanded && !loading && options[activeIndex]) choose(options[activeIndex]); }
      }} />
    </div>
    {selectedKey && identityError && <><Notice danger>{identityError}</Notice><Button type="button" className="secondary" onClick={retry}>Retry assignee emails</Button></>}
    {expanded && <div className="assignee-popover">
      <div ref={list} id={`${id}-list`} role="listbox" aria-label="Matching members" className="assignee-options" aria-busy={loading}>
        {options.map((member, index) => <button type="button" role="option" aria-selected={index === activeIndex} tabIndex={-1} id={`${id}-option-${index}`} key={member.user_id} onMouseDown={event => event.preventDefault()} onClick={() => choose(member)}>{member.email}</button>)}
      </div>
      {loading && <p className="hint" role="status">Loading members…</p>}
      {!loading && !error && !options.length && <p className="hint" role="status">No matching members.</p>}
      {error && <><Notice danger>{error}</Notice><Button type="button" className="secondary" onClick={retry}>Retry member list</Button></>}
      {page.next_cursor && <Button type="button" className="secondary" disabled={loading} onClick={more}>Load more members</Button>}
    </div>}
  </div>;
}
