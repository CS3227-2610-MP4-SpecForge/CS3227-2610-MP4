export const usernamePattern = "[A-Za-z0-9_]{3,24}";
export const legacyUsernamePrefix = "legacy_";
export const usernameHint = "Choose a username with 3–24 letters, digits or underscores.";
export const reservedUsernameMessage = "Choose a different username.";
export const formerAccountLabel = "Former account";

export function assigneeUsernameLabel(names: (string | null)[]) {
  return names.map(name => name ?? formerAccountLabel).join(", ") || "Unassigned";
}
