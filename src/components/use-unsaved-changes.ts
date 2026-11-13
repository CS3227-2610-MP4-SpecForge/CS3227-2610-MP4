"use client";
import { useEffect, useRef, type RefObject } from "react";
import { useConfirm } from "./confirm";
import { guardDeparture } from "./departure-guard";

export function useUnsavedChanges(active: boolean, departure?: RefObject<boolean>) {
  const localDeparture = useRef(false);
  const leaving = departure ?? localDeparture;
  const ask = useConfirm();
  useEffect(() => {
    if (!active) return;
    const confirm = async () =>
      leaving.current ||
      ask({
        title: "Leave with unsaved work?",
        message: "Your latest changes may be lost.",
        confirmLabel: "Leave",
        cancelLabel: "Stay",
        danger: true,
      });
    const removeGuard = guardDeparture(confirm);
    const unload = (event: BeforeUnloadEvent) => {
      if (!leaving.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !link ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        link.getAttribute("target") === "_blank" ||
        leaving.current
      )
        return;
      const target = new URL(link.getAttribute("href")!, window.location.href);
      if (
        target.hash &&
        target.origin === window.location.origin &&
        target.pathname === window.location.pathname &&
        target.search === window.location.search
      )
        return;
      // The styled dialog cannot block, so hold the click and replay it on Leave.
      event.preventDefault();
      event.stopPropagation();
      // A menu or popover may have closed and unmounted the link meanwhile.
      void confirm().then(leave => {
        if (!leave) return;
        leaving.current = true;
        // A full load keeps leaving set, so the unload prompt does not ask again.
        if (!link.isConnected) return window.location.assign(target.href);
        (link as HTMLElement).click();
        window.setTimeout(() => {
          leaving.current = false;
        }, 0);
      });
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      removeGuard();
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [active, leaving, ask]);
}
