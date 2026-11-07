import { AiFailure, type AiProvider } from "../server/soc";
export const localFakeAi: AiProvider = async input => {
  if (input.message.includes("simulate local timeout")) throw new AiFailure("local_timeout", { source: "local_deadline", elapsed_ms: 60000 });
  if (input.message.includes("simulate upstream 502")) throw new AiFailure("upstream_http", { source: "upstream_http", elapsed_ms: 1234, http_status: 502 });
  if (input.message.includes("simulate network failure")) throw new AiFailure("network_error", { source: "network", elapsed_ms: 567 });
  if (input.message.toLowerCase().includes("simulate failure")) throw new AiFailure("unavailable");
  if (input.message.toLowerCase().includes("slow proposal")) await new Promise(resolve => setTimeout(resolve, 1500));
  return input.message.toLowerCase().includes("proposal") ? { reply: "Here is a proposed task. Review it before applying.", proposal: { title: "AI task proposal", description: "## Problem description\n\nPMs need to find saved requests.\n\n## Desired behaviour\n\n- Search request titles.\n\n## Assumptions / unresolved questions\n\nSearch applies to the active organisation." } } : { reply: "Who is this feature for?", proposal: null };
};
