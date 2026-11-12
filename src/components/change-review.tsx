"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ChatTurn } from "@/chat";
import type { RequestFields } from "@/requests";
import {
  applyChange,
  applyChanges,
  changeStatus,
  summarizeChanges,
  ticketDiff,
  undoChange,
  wordDiff,
  type ChangeField,
  type DiffRow,
  type TicketChange,
  type WordPart,
} from "@/ticket-changes";
import { Markdown } from "./markdown";
import { Button, Modal, Notice, useNotifications } from "./ui";

const fieldLabels: Record<ChangeField, string> = { title: "Title", description: "Description" };
type RowState = "open" | "applied" | "rejected" | "outdated";
const fieldOf = (row: DiffRow) => (row.kind === "same" ? row.field : row.change.field);

function Words({ parts, removed }: { parts: WordPart[]; removed: boolean }) {
  return (
    <>
      {parts.map((part, at) =>
        !part.changed ? (
          <Fragment key={at}>{part.text}</Fragment>
        ) : removed ? (
          <del key={at}>{part.text}</del>
        ) : (
          <ins key={at}>{part.text}</ins>
        ),
      )}
    </>
  );
}

function Side({
  label,
  text,
  parts,
  removed,
  formatted,
}: {
  label: string;
  text: string;
  parts: WordPart[];
  removed: boolean;
  formatted: boolean;
}) {
  return (
    <div className={`change-side ${removed ? "change-original" : "change-proposed"}`}>
      <span className="change-side-label">{label}</span>
      {!text ? (
        <p className="hint">{removed ? "Nothing here yet." : "Removed."}</p>
      ) : formatted ? (
        <Markdown text={text} />
      ) : (
        <pre>
          <Words parts={parts} removed={removed} />
        </pre>
      )}
    </div>
  );
}

function Unchanged({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  const text = lines.join("\n");
  if (!text.trim()) return null;
  return (
    <div className="change-unchanged">
      <Button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {open ? "Hide" : "Show"} {lines.length} unchanged line{lines.length === 1 ? "" : "s"}
      </Button>
      {open && <pre>{text}</pre>}
    </div>
  );
}

/**
 * Review one AI suggestion change by change. Accept and Undo edit the ticket
 * immediately through onChange; rejections are reported to the caller, which
 * keeps them for this page only.
 */
export function ChangeReview({
  turn,
  fields,
  rejected,
  blockedReason,
  onChange,
  onReject,
  onClose,
}: {
  turn: ChatTurn;
  fields: RequestFields;
  rejected: ReadonlySet<string>;
  blockedReason: string | null;
  onChange(next: RequestFields): void;
  onReject(ids: string[]): void;
  onClose(): void;
}) {
  const proposal = turn.proposal!;
  const rows = useMemo(() => ticketDiff(turn.input_fields, proposal), [turn.input_fields, proposal]);
  const changes = useMemo(() => rows.flatMap(row => (row.kind === "change" ? [row.change] : [])), [rows]);
  const words = useMemo(
    () => new Map(changes.map(change => [change.id, wordDiff(change.before, change.after)])),
    [changes],
  );
  const [formatted, setFormatted] = useState(false);
  const { notify } = useNotifications();
  // A fresh object per action so repeating an action on one row refocuses.
  const [focusFrom, setFocusFrom] = useState<{ at: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const state = (change: TicketChange): RowState => {
    const status = changeStatus(change, fields);
    return status !== "applied" && rejected.has(change.id) ? "rejected" : status;
  };
  const states = changes.map(state);
  const openChanges = changes.filter((_, at) => states[at] === "open");
  const applied = states.filter(value => value === "applied").length;
  const rejectedCount = states.filter(value => value === "rejected").length;
  const blocked = blockedReason !== null;
  // After an action, move to the next open row, wrapping, or to Done. Undo
  // passes a position just before its own row so focus stays on that row.
  useEffect(() => {
    if (focusFrom === null) return;
    const buttons = [
      ...(body.current?.closest("dialog")?.querySelectorAll<HTMLButtonElement>("[data-change-accept]") ?? []),
    ];
    const next = buttons.find(button => Number(button.dataset.changeAccept) > focusFrom.at) ?? buttons[0];
    (next ?? body.current?.closest("dialog")?.querySelector<HTMLButtonElement>(".change-review-done"))?.focus();
  }, [focusFrom]);
  function act(at: number, next: RequestFields | null) {
    if (next) onChange(next);
    setFocusFrom({ at });
  }
  function acceptAll() {
    const { fields: next, skipped } = applyChanges(openChanges, fields);
    act(-1, next);
    if (skipped)
      notify(
        `${skipped} change${skipped === 1 ? "" : "s"} could not be applied because an earlier change overlapped ${skipped === 1 ? "it" : "them"}.`,
        true,
      );
  }
  let number = 0;
  return (
    <Modal
      className="review-modal"
      label="Review AI changes"
      closeLabel="Close review"
      onClose={onClose}
      title={
        <>
          <h2>Review AI changes</h2>
          <p className="hint">{summarizeChanges(changes)}</p>
        </>
      }
      footer={
        <>
          <span className="hint" role="status">
            {applied} applied, {rejectedCount} rejected
          </span>
          <Button type="button" className="change-review-done" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div ref={body} className="stack change-review">
        <div className="change-review-tools">
          <div className="actions">
            <Button type="button" disabled={blocked || openChanges.length === 0} onClick={acceptAll}>
              Accept all
            </Button>
            <Button
              type="button"
              className="secondary"
              disabled={openChanges.length === 0}
              onClick={() => {
                onReject(openChanges.map(change => change.id));
                setFocusFrom({ at: -1 });
              }}
            >
              Reject all
            </Button>
          </div>
          <Button
            type="button"
            className="secondary"
            aria-pressed={formatted}
            onClick={() => setFormatted(value => !value)}
          >
            Formatted
          </Button>
        </div>
        {blockedReason && <Notice danger>{blockedReason}</Notice>}
        {changes.length === 0 && <Notice>The AI suggested no changes.</Notice>}
        {rows.map((row, at) => {
          const field = fieldOf(row);
          const heading = (at === 0 || fieldOf(rows[at - 1]) !== field) && (
            <h3 className="change-field">{fieldLabels[field]}</h3>
          );
          if (row.kind === "same")
            return (
              <Fragment key={`same-${at}`}>
                {heading}
                <Unchanged lines={row.lines} />
              </Fragment>
            );
          const { change } = row;
          const index = number++;
          const value = states[index];
          const parts = words.get(change.id)!;
          return (
            <Fragment key={change.id}>
              {heading}
              <section
                className={`change-row change-${value}`}
                aria-label={`Change ${index + 1} of ${changes.length}: ${fieldLabels[change.field]}`}
              >
                <Side label="Original" text={change.before} parts={parts.before} removed formatted={formatted} />
                <Side label="Proposed" text={change.after} parts={parts.after} removed={false} formatted={formatted} />
                <div className="change-actions">
                  {value === "open" && (
                    <>
                      <Button
                        type="button"
                        data-change-accept={index}
                        disabled={blocked}
                        onClick={() => act(index, applyChange(change, fields))}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          onReject([change.id]);
                          setFocusFrom({ at: index });
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {value === "applied" && (
                    <>
                      <span className="change-state">Applied</span>
                      <Button
                        type="button"
                        className="secondary"
                        disabled={blocked}
                        onClick={() => act(index - 0.5, undoChange(change, fields))}
                      >
                        Undo
                      </Button>
                    </>
                  )}
                  {value === "rejected" && <span className="change-state">Rejected</span>}
                  {value === "outdated" && <span className="change-state">You&apos;ve changed this part since</span>}
                </div>
              </section>
            </Fragment>
          );
        })}
      </div>
    </Modal>
  );
}
