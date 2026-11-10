export const accountUpdatedEvent = "specforge:account-updated";
export type AccountIdentity = { username: string; email: string };
export function publishAccount(account: AccountIdentity) {
  window.dispatchEvent(new CustomEvent<AccountIdentity>(accountUpdatedEvent, { detail: account }));
}
