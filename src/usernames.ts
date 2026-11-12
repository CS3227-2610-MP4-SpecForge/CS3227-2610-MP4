export const usernamePattern = "[A-Za-z0-9_]{3,24}";
export const legacyUsernamePrefix = "legacy_";
/** Kit accounts own this prefix; people cannot choose it at signup or rename. */
export const demoUsernamePrefix = "demo_";
export const reservedUsername = (name: string) =>
  [legacyUsernamePrefix, demoUsernamePrefix].some(prefix => name.toLowerCase().startsWith(prefix));
export const usernameHint = "Choose a username with 3–24 letters, digits or underscores.";
export const reservedUsernameMessage = "Choose a different username.";
export const formerAccountLabel = "Former account";

export function assigneeUsernameLabel(names: (string | null)[]) {
  return names.map(name => name ?? formerAccountLabel).join(", ") || "Unassigned";
}
