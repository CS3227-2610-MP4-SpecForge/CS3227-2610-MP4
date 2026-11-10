// Programmatic departures must ask editors before performing irreversible actions
// such as ending the session. Anchor and native unload guards remain in the editor.
const departureEvent = "specforge:before-departure";

export function requestDeparture() {
  return window.dispatchEvent(new Event(departureEvent, { cancelable: true }));
}

export function guardDeparture(confirm: () => boolean) {
  const handler = (event: Event) => {
    if (!event.defaultPrevented && !confirm()) event.preventDefault();
  };
  window.addEventListener(departureEvent, handler);
  return () => window.removeEventListener(departureEvent, handler);
}
