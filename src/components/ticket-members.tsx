"use client";
import { useEffect, useRef, useState } from "react";
import type { TicketMember } from "@/delivery";
import { api, failureMessage } from "./http";
import { Button, Field, Notice } from "./ui";
export function TicketMembers({ organisationId, selected, onChange, disabled = false, onMembers }: { organisationId: string; selected?: string[]; onChange?: (ids: string[]) => void; disabled?: boolean; onMembers?: (members: TicketMember[]) => void }) {
  const [members, setMembers] = useState<TicketMember[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const generation = useRef(0);
  const [reload, setReload] = useState(0);
  const path = `/api/organisations/${organisationId}/ticket-members`;
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => { api(`${path}?search=${encodeURIComponent(search)}`).then(result => { if (active) { setMembers(result.members); setCursor(result.next_cursor); setError(""); } })
      .catch(failure => { if (active) setError(failureMessage(failure)); }).finally(() => { if (active) setLoading(false); }); }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [path, reload, search]);
  useEffect(() => { onMembers?.(members); }, [members, onMembers]);
  async function more() {
    if (loading) return; const pageGeneration = generation.current; setLoading(true);
    try { const result = await api(`${path}?after=${cursor}&search=${encodeURIComponent(search)}`); if (generation.current !== pageGeneration) return; setMembers(existing => [...existing, ...result.members.filter((member: TicketMember) => !existing.some(old => old.user_id === member.user_id))]); setCursor(result.next_cursor); setError(""); }
    catch (failure) { if (generation.current === pageGeneration) setError(failureMessage(failure)); } finally { if (generation.current === pageGeneration) setLoading(false); }
  }
  return <div className="stack member-picker">
    {onChange && <>
      <Field id="member-search" label="Search members" value={search} onChange={event => { generation.current++; setSearch(event.target.value); setLoading(true); setCursor(null); }} placeholder="Account ID or role" />
      <p className="hint">{selected?.length ?? 0}/5 assigned. Only current members can be assigned. Search by account ID or role across the organisation.</p>
      <div className="member-options">{members.map(member => <label className="checkbox-field" key={member.user_id}>
        <input type="checkbox" aria-label={`Assign ${member.user_id}`} checked={selected?.includes(member.user_id) ?? false} disabled={disabled || !selected?.includes(member.user_id) && (selected?.length ?? 0) >= 5} onChange={event => onChange(event.target.checked ? [...(selected ?? []), member.user_id] : (selected ?? []).filter(id => id !== member.user_id))} />
        <span><span className="account-id">{member.user_id}</span> <span className="muted">{member.app_role}</span></span>
      </label>)}</div>
      {selected?.filter(id => !members.some(member => member.user_id === id)).map(id => <label className="checkbox-field" key={id}><input type="checkbox" aria-label={`Assign ${id}`} checked disabled={disabled} onChange={() => onChange(selected.filter(value => value !== id))} /><span>{id} (not in loaded members)</span></label>)}
    </>}
    {loading && <p role="status">Loading members…</p>}
    {error && <><Notice danger>{error}</Notice><Button type="button" className="secondary" onClick={() => { generation.current++; setLoading(true); setReload(n => n + 1); }}>Retry member list</Button></>}
    {cursor && <Button type="button" className="secondary" disabled={loading || disabled} onClick={more}>Load more members</Button>}
  </div>;
}
