"use client";
import { useEffect, useState } from "react";
import { api, failureMessage } from "./http";
import { useConfirm, type ConfirmOptions } from "./confirm";
import { Button, Field, Notice, Pill, useNotifications } from "./ui";

type Invitation = {
  id: string;
  organisation_name: string;
  recipient_email: string;
  status: "pending" | "expired" | "declined";
  expires_at: string;
};
type Member = { user_id: string; username: string; email: string; app_role: string; is_admin: boolean };
type Organisation = { id: string; name: string; isAdmin: boolean };
export function Membership({
  selected,
  accountId,
  revision,
  onChanged,
  showInbox = true,
}: {
  showInbox?: boolean;
  selected?: Organisation;
  accountId: string;
  revision: number;
  onChanged(): void;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [outgoing, setOutgoing] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const { notify } = useNotifications();
  const confirm = useConfirm();
  const orgId = selected?.id;
  const isAdmin = selected?.isAdmin;
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => {
        if (!active) return;
        setLoading(true);
        setInvitations([]);
        setMembers([]);
        setOutgoing([]);
        return Promise.all([
          api("/api/invitations"),
          orgId && isAdmin ? api(`/api/organisations/${orgId}/members`) : Promise.resolve({ members: [] }),
          orgId && isAdmin ? api(`/api/organisations/${orgId}/invitations`) : Promise.resolve({ invitations: [] }),
        ]);
      })
      .then(result => {
        if (!result) return;
        const [inbox, roster, sent] = result;
        if (active) {
          setInvitations(inbox.invitations);
          setMembers(roster.members);
          setOutgoing(sent.invitations);
        }
      })
      .catch(failure => {
        if (active) notify(failureMessage(failure), true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orgId, isAdmin, revision, notify]);
  async function act(path: string, input: object, confirmation?: ConfirmOptions) {
    if (pending || (confirmation && !(await confirm(confirmation)))) return;
    setPending(true);
    try {
      const result = await api(path, input);
      notify(result.message);
      setEmail("");
      onChanged();
    } catch (failure) {
      notify(failureMessage(failure), true);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="stack membership-section" aria-label="Organisation membership" aria-busy={loading || pending}>
      {showInbox && (
        <div className="section-title">
          <h2>Membership</h2>
          <Button
            className="secondary"
            disabled={pending || loading}
            onClick={() => {
              onChanged();
            }}
          >
            Refresh membership
          </Button>
        </div>
      )}
      {loading ? (
        <Notice>Loading membership…</Notice>
      ) : (
        <>
          {showInbox && (
            <div className="card">
              <h2>Your invitations</h2>
              {invitations.length === 0 ? (
                <p className="muted">No pending invitations.</p>
              ) : (
                <ul className="organisation-list">
                  {invitations.map(invitation => (
                    <li className="membership-row" key={invitation.id}>
                      <strong>{invitation.organisation_name}</strong>
                      <p className="muted">
                        {invitation.status === "expired"
                          ? "Expired — ask an admin to resend."
                          : `Expires ${new Date(invitation.expires_at).toLocaleString()}`}
                      </p>
                      {invitation.status === "pending" && (
                        <div className="actions">
                          <Button
                            disabled={pending}
                            onClick={() => act(`/api/invitations/${invitation.id}`, { action: "accept" })}
                          >
                            Accept
                          </Button>
                          <Button
                            className="secondary"
                            disabled={pending}
                            onClick={() =>
                              act(
                                `/api/invitations/${invitation.id}`,
                                { action: "decline" },
                                {
                                  title: "Decline invitation?",
                                  message: `You will not join ${invitation.organisation_name} unless invited again.`,
                                  confirmLabel: "Decline",
                                  cancelLabel: "Keep invitation",
                                  danger: true,
                                },
                              )
                            }
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {selected && (
            <div className="stack">
              {isAdmin && (
                <>
                  <section className="invite-member-panel stack" aria-label="Invite Member">
                    <h2>Invite Member</h2>
                    <form
                      className="invitation-form"
                      onSubmit={event => {
                        event.preventDefault();
                        void act(`/api/organisations/${selected.id}/invitations`, { email });
                      }}
                    >
                      <Field
                        id="invitation-email"
                        label="Invite by email"
                        hint="Recipients can accept in their workspace after registering and verifying this email. Invitations expire after seven days."
                        type="email"
                        maxLength={254}
                        required
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        disabled={pending}
                      />
                      <Button disabled={pending}>Send invitation</Button>
                    </form>
                    <div>
                      <h3>Outgoing invitations</h3>
                      {outgoing.length === 0 ? (
                        <p className="muted">No pending outgoing invitations.</p>
                      ) : (
                        <ul className="organisation-list">
                          {outgoing.map(invitation => (
                            <li className="membership-row outgoing-invitation-row" key={invitation.id}>
                              <div className="invitation-identity">
                                <strong>{invitation.recipient_email}</strong>
                                <p className="muted">
                                  {invitation.status === "declined"
                                    ? "Declined"
                                    : invitation.status === "expired"
                                      ? "Expired"
                                      : `Expires ${new Date(invitation.expires_at).toLocaleString()}`}
                                </p>
                              </div>
                              <div className="actions">
                                {invitation.status === "expired" && (
                                  <Button
                                    disabled={pending}
                                    onClick={() =>
                                      act(`/api/organisations/${selected.id}/invitations/${invitation.id}`, {
                                        action: "resend",
                                      })
                                    }
                                  >
                                    Resend
                                  </Button>
                                )}
                                <Button
                                  className="secondary"
                                  disabled={pending}
                                  onClick={() =>
                                    act(
                                      `/api/organisations/${selected.id}/invitations/${invitation.id}`,
                                      { action: "cancel" },
                                      {
                                        title: "Cancel invitation?",
                                        message: `${invitation.recipient_email} will no longer be able to join ${selected.name} with this invitation.`,
                                        confirmLabel: "Cancel invitation",
                                        cancelLabel: "Keep invitation",
                                        danger: true,
                                      },
                                    )
                                  }
                                >
                                  Cancel invitation
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                  <section aria-label="Existing members">
                    <h2>Existing members</h2>
                    <ul className="organisation-list">
                      {members.map(member => (
                        <li className="membership-row member-roster-row" key={member.user_id}>
                          <div className="member-identity">
                            <div className="member-name">
                              <strong>{member.username}</strong>
                              {member.is_admin && <Pill tone="purple">Admin</Pill>}
                            </div>
                            <p className="muted member-role">
                              {member.app_role}
                              {member.user_id === accountId ? " · You" : ""}
                            </p>
                          </div>
                          <div className="actions">
                            <Button
                              className="secondary"
                              disabled={pending}
                              onClick={() =>
                                act(
                                  `/api/organisations/${selected.id}/members/${member.user_id}`,
                                  { action: member.is_admin ? "demote" : "promote" },
                                  member.is_admin
                                    ? {
                                        title: "Revoke admin access?",
                                        message: `${member.username} will no longer manage members of ${selected.name}.`,
                                        confirmLabel: "Revoke admin",
                                        danger: true,
                                      }
                                    : {
                                        title: "Grant admin access?",
                                        message: `${member.username} will be able to manage members of ${selected.name}.`,
                                        confirmLabel: "Grant admin",
                                      },
                                )
                              }
                            >
                              {member.is_admin ? "Demote admin" : "Promote admin"}
                            </Button>
                            {member.user_id !== accountId && (
                              <Button
                                className="secondary"
                                disabled={pending}
                                onClick={() =>
                                  act(
                                    `/api/organisations/${selected.id}/members/${member.user_id}`,
                                    { action: "remove" },
                                    {
                                      title: "Remove member?",
                                      message: `${member.username} will lose access to ${selected.name} until invited again.`,
                                      confirmLabel: "Remove member",
                                      danger: true,
                                    },
                                  )
                                }
                              >
                                Remove member
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
              <p className="muted">
                Every organisation must keep at least one admin. Promote another member before the last admin leaves or
                loses admin status.
              </p>
              <Button
                className="secondary"
                disabled={pending}
                onClick={() =>
                  act(
                    `/api/organisations/${selected.id}/members/${accountId}`,
                    { action: "leave" },
                    {
                      title: `Leave ${selected.name}?`,
                      message: "You will lose access until invited again.",
                      confirmLabel: "Leave organisation",
                      danger: true,
                    },
                  )
                }
              >
                Leave organisation
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
