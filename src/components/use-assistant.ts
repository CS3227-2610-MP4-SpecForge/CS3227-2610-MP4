"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { aiBrowserTimeoutMs } from "@/ai-diagnostics";
import type { AiUsage, AssistantIntent } from "@/assistance";
import type { ChatTurn } from "@/chat";
import type { RequestFields } from "@/requests";
import { aiLimitNotice, api, ApiError, ApiWaitTimeout, failureMessage } from "./http";
import { useNotificationState } from "./ui";

export type AssistantRequest = {
  key: string;
  revision: number;
  fields: RequestFields;
  intent: AssistantIntent;
  message?: string;
  retry: boolean;
};
// Advisory only: the server's 48,000-byte bound decides. Measure the payload as
// the server sends it (a JSON string inside the JSON messages array) and reserve
// room for the instructions and up to three recent turns.
export const contextByteLimit = 48000;
const reservedBytes = 12000;
export function tooLargeForAi(fields: RequestFields, message = "") {
  const wire = JSON.stringify([{ role: "user", content: JSON.stringify({ ticket: fields, instruction: message }) }]);
  return new TextEncoder().encode(wire).byteLength + reservedBytes > contextByteLimit;
}
function usageFrom(value: unknown): AiUsage | null {
  if (!value || typeof value !== "object" || !("usage" in value)) return null;
  const usage = (value as { usage: unknown }).usage;
  return usage && typeof usage === "object" && typeof (usage as AiUsage).remaining === "number"
    ? (usage as AiUsage)
    : null;
}

// One PM assistant conversation: loading, sending one intent at a time,
// reconciling lost responses, polling a running turn and tracking usage.
export function useAssistant({
  path,
  canSend,
  onSuggestion,
}: {
  path: string;
  canSend: boolean;
  onSuggestion(turn: ChatTurn): Promise<void>;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useNotificationState(true);
  // A shared AI limit is expected, so it is shown as a plain notice, not an error.
  const [limitNotice, setLimitNotice] = useState("");
  const [replay, setReplay] = useState<AssistantRequest | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  // The composer text lives here so a reconciled send can clear it.
  const [message, setMessage] = useState("");
  // The turn this browser last settled, which may be an earlier deduplicated turn.
  const [latestId, setLatestId] = useState<string | null>(null);
  const operation = useRef(false);
  const pending = useRef<AssistantRequest | null>(null);
  const readConversation = useCallback(
    async (sendFailure?: string) => {
      try {
        const result: { turns: ChatTurn[]; usage: AiUsage | null } = await api(path);
        setTurns(result.turns);
        setUsage(result.usage);
        setLatestId(null);
        const sent = pending.current;
        if (sent && !result.turns.some(turn => turn.turn_key === sent.key)) {
          setReplay(sent);
          setError(sendFailure ?? "");
          return false;
        }
        setError("");
        if (sent) {
          pending.current = null;
          setReplay(null);
          setUnresolved(false);
          if (sent.message) setMessage(current => (current.trim() === sent.message ? "" : current));
        }
        return Boolean(sent);
      } catch (failure) {
        setReplay(null);
        setError(failureMessage(failure) + " Reopen the AI assistant to check again.");
        return false;
      }
    },
    [path, setError],
  );
  const sync = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setLoading(true);
    try {
      await readConversation();
    } finally {
      operation.current = false;
      setLoading(false);
    }
  }, [readConversation]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return sync();
    });
    return () => {
      active = false;
    };
  }, [sync]);
  const running = turns.some(turn => turn.status === "running");
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      void sync();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [turns, running, sync]);
  // Re-read usage once an exhausted hourly or daily window resets so a blocked panel recovers.
  const exhaustedUntil =
    usage?.daily?.remaining === 0 ? usage.daily.resets_at : usage?.remaining === 0 ? usage.resets_at : null;
  useEffect(() => {
    if (!exhaustedUntil) return;
    const timer = window.setTimeout(
      () => {
        setLimitNotice("");
        void sync();
      },
      Math.min(Math.max(0, Date.parse(exhaustedUntil) - Date.now()) + 1000, 2147483647),
    );
    return () => window.clearTimeout(timer);
  }, [exhaustedUntil, sync]);
  const disabled =
    busy || running || loading || !canSend || unresolved || usage?.remaining === 0 || usage?.daily?.remaining === 0;
  const canReplay = !busy && !running && !loading && canSend;
  // Returns true once the request is settled in the saved conversation.
  async function send(input: AssistantRequest) {
    if (operation.current || !canSend || running || (unresolved && pending.current?.key !== input.key)) return false;
    operation.current = true;
    setBusy(true);
    setError("");
    setLimitNotice("");
    setReplay(null);
    setUnresolved(true);
    pending.current = input;
    try {
      const result = await api(path, input, aiBrowserTimeoutMs);
      const turn: ChatTurn = result.turn;
      setUsage(usageFrom(result));
      setTurns(previous =>
        [...previous.filter(item => item.id !== turn.id), turn].sort(
          (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
        ),
      );
      pending.current = null;
      setUnresolved(false);
      setLatestId(turn.id);
      if (input.message) setMessage(current => (current.trim() === input.message ? "" : current));
      if (turn.proposal && turn.status === "completed") await onSuggestion(turn);
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 429) {
        setUsage(usageFrom(failure.body) ?? usage);
        pending.current = null;
        setUnresolved(false);
        const notice = aiLimitNotice(failure);
        if (notice) setLimitNotice(notice);
        else setError(failure.message);
        return false;
      }
      const detail =
        failure instanceof ApiWaitTimeout
          ? `The browser stopped waiting for AI after ${failure.timeoutMs / 1000} seconds.`
          : failureMessage(failure);
      if (pending.current) return await readConversation(detail);
      setError(detail);
      return false;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  const latest = turns.find(turn => turn.id === latestId) ?? turns.at(-1);
  return {
    turns,
    latest,
    usage,
    loading,
    busy,
    running,
    disabled,
    canReplay,
    error,
    limitNotice,
    replay,
    message,
    setMessage,
    send,
    sync,
  };
}
export type Assistant = ReturnType<typeof useAssistant>;
