import { z } from "zod";
import { usernameHint } from "../usernames";
import { signupUsername } from "./auth";
import { error, json, readBody, serviceUnavailable } from "./http";
import type { Route, SessionContext } from "./routes";

const profileRow = z.object({ app_role: z.enum(["PM", "Developer"]), username: z.string() });

/** Answers with the signed-in user's account, as stored after any rename. */
async function account({ request, client, user }: SessionContext) {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("app_role,username")
    .eq("id", user.id)
    .single();
  const identity = profileRow.safeParse(profile);
  if (profileError || !identity.success)
    return serviceUnavailable(request, profileError ?? identity.error, "Account unavailable. Try again later.");
  return json({
    account: {
      id: user.id,
      email: user.email,
      role: identity.data.app_role,
      username: identity.data.username,
      createdAt: user.created_at,
    },
  });
}

export const accountRoutes: Route<SessionContext>[] = [
  { method: "GET", pattern: /^\/api\/account$/, handler: account },
  {
    method: "POST",
    pattern: /^\/api\/account$/,
    async handler(context) {
      const { request, client } = context;
      const input = z.strictObject({ username: signupUsername }).safeParse(await readBody(request));
      if (!input.success)
        return error(
          input.error.issues.find(issue => issue.path[0] === "username")?.message ??
            "Only the username can be changed.",
          400,
        );
      const { error: renameError } = await client.rpc("rename_username", { new_username: input.data.username });
      if (renameError?.code === "23505") return error("That username is already taken. Choose another.", 409);
      if (renameError?.code === "22023") return error(usernameHint, 400);
      if (renameError?.code === "42501") return error("Profile unavailable. Sign in again.", 403);
      if (renameError)
        return serviceUnavailable(
          request,
          renameError,
          "Unable to save your profile. Check the saved username before retrying.",
        );
      return account(context);
    },
  },
];
