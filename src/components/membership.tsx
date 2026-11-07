"use client";
import { useEffect, useState } from "react";
import { api, failureMessage } from "./http";
import { Button, Field, Notice } from "./ui";

type Invitation = { id: string; organisation_name: string; recipient_email: string; status: "pending" | "expired"; expires_at: string };
type Member = { user_id: string; email: string; app_role: string; is_admin: boolean };
type Organisation = { id: string; name: string; isAdmin: boolean };
export function Membership({ selected, accountId, revision, onChanged }: {
  selected?: Organisation; accountId: string; revision: number; onChanged(): void;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [outgoing, setOutgoing] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const orgId = selected?.id;
  const isAdmin = selected?.isAdmin;
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true); setInvitations([]); setMembers([]); setOutgoing([]);
      return Promise.all([
      api("/api/invitations"),
      orgId && isAdmin ? api(`/api/organisations/${orgId}/members`) : Promise.resolve({ members: [] }),
      orgId && isAdmin ? api(`/api/organisations/${orgId}/invitations`) : Promise.resolve({ invitations: [] }),
      ]);
    }).then(result => {
      if (!result) return;
      const [inbox, roster, sent] = result;
      if (active) { setError(""); setInvitations(inbox.invitations); setMembers(roster.members); setOutgoing(sent.invitations); }
    }).catch(failure => { if (active) setError(failureMessage(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orgId, isAdmin, revision]);
  async function act(path: string, input: object, confirmation?: string) {
    if (pending || (confirmation && !window.confirm(confirmation))) return;
    setPending(true); setError(""); setMessage("");
    try {
      const result = await api(path, input);
      setMessage(result.message); setEmail(""); onChanged();
    } catch (failure) { setError(failureMessage(failure)); }
    finally { setPending(false); }
  }
  return <section className="stack membership-section" aria-label="Organisation membership" aria-busy={loading || pending}>
    <div className="section-title"><h2>Membership</h2><Button className="secondary" disabled={pending || loading} onClick={() => { setError(""); onChanged(); }}>Refresh membership</Button></div>
    {error && <Notice danger>{error}</Notice>}{message && <Notice>{message}</Notice>}
    {loading ? <Notice>Loading membership…</Notice> : <>
      <div className="card"><h2>Your invitations</h2>{invitations.length === 0 ? <p className="muted">No pending invitations.</p> : <ul className="organisation-list">{invitations.map(invitation => <li className="membership-row" key={invitation.id}>
        <strong>{invitation.organisation_name}</strong><p className="muted">{invitation.status === "expired" ? "Expired — ask an admin to resend." : `Expires ${new Date(invitation.expires_at).toLocaleString()}`}</p>
        {invitation.status === "pending" && <div className="actions"><Button disabled={pending} onClick={() => act(`/api/invitations/${invitation.id}`, { action: "accept" })}>Accept</Button><Button className="secondary" disabled={pending} onClick={() => act(`/api/invitations/${invitation.id}`, { action: "decline" }, `Decline the invitation to ${invitation.organisation_name}?`)}>Decline</Button></div>}
      </li>)}</ul>}</div>
      {selected && <div className="card stack"><h2>Manage {selected.name}</h2>
        {isAdmin && <>
          <form className="stack" onSubmit={event => { event.preventDefault(); void act(`/api/organisations/${selected.id}/invitations`, { email }); }}>
            <Field id="invitation-email" label="Invite by registered email" hint="Invitations appear in the recipient’s workspace and expire after seven days." type="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={pending} />
            <Button disabled={pending}>Send invitation</Button>
          </form>
          <div><h3>Outgoing invitations</h3>{outgoing.length === 0 ? <p className="muted">No pending outgoing invitations.</p> : <ul className="organisation-list">{outgoing.map(invitation => <li className="membership-row" key={invitation.id}><strong>{invitation.recipient_email}</strong><p className="muted">{invitation.status === "expired" ? "Expired" : `Expires ${new Date(invitation.expires_at).toLocaleString()}`}</p><div className="actions">
            {invitation.status === "expired" && <Button disabled={pending} onClick={() => act(`/api/organisations/${selected.id}/invitations/${invitation.id}`, { action: "resend" })}>Resend</Button>}
            <Button className="secondary" disabled={pending} onClick={() => act(`/api/organisations/${selected.id}/invitations/${invitation.id}`, { action: "cancel" }, `Cancel the invitation for ${invitation.recipient_email}?`)}>Cancel invitation</Button>
          </div></li>)}</ul>}</div>
          <div><h3>Members</h3><ul className="organisation-list">{members.map(member => <li className="membership-row" key={member.user_id}><strong>{member.email}</strong><p className="muted">{member.app_role} · {member.is_admin ? "Admin" : "Member"}{member.user_id === accountId ? " · You" : ""}</p><div className="actions">
            <Button className="secondary" disabled={pending} onClick={() => act(`/api/organisations/${selected.id}/members/${member.user_id}`, { action: member.is_admin ? "demote" : "promote" }, `${member.is_admin ? "Revoke" : "Grant"} admin access for ${member.email}?`)}>{member.is_admin ? "Demote admin" : "Promote to admin"}</Button>
            {member.user_id !== accountId && <Button className="secondary" disabled={pending} onClick={() => act(`/api/organisations/${selected.id}/members/${member.user_id}`, { action: "remove" }, `Remove ${member.email} from ${selected.name}?`)}>Remove member</Button>}
          </div></li>)}</ul></div>
        </>}
        <p className="muted">Every organisation must keep at least one admin. Promote another member before the last admin leaves or loses admin status.</p>
        <Button className="secondary" disabled={pending} onClick={() => act(`/api/organisations/${selected.id}/members/${accountId}`, { action: "leave" }, `Leave ${selected.name}? You will lose access until invited again.`)}>Leave organisation</Button>
      </div>}
    </>}
  </section>;
}
