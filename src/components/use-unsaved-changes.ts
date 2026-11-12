"use client";
import { useEffect, useRef, type RefObject } from "react";
import { guardDeparture } from "./departure-guard";

export function useUnsavedChanges(active: boolean, departure?: RefObject<boolean>) {
  const localDeparture = useRef(false);
  const leaving = departure ?? localDeparture;
  useEffect(() => {
    if (!active) return;
    const confirm = () =>
      leaving.current || window.confirm("Leave with unsaved work? Your latest changes may be lost.");
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
      if (!confirm()) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        leaving.current = true;
        window.setTimeout(() => {
          leaving.current = false;
        }, 0);
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      removeGuard();
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [active, leaving]);
}
