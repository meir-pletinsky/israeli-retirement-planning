import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Frames to wait for a `#anchor` target that the new screen has not rendered yet. */
const ANCHOR_RETRY_FRAMES = 30;

function focusWithoutScroll(element: HTMLElement) {
  if (!element.hasAttribute("tabindex") && !element.matches("a[href], button, input, select, textarea")) {
    element.setAttribute("tabindex", "-1");
  }
  element.focus({ preventScroll: true });
}

/**
 * Opens every new screen at its top and moves keyboard and screen-reader focus to the page
 * heading. A link to a section (`/path#id`) scrolls to that section instead. Browser back and
 * forward, and plain in-page `#` links, keep the browser's own scroll position.
 */
export function RouteScrollManager() {
  const { key, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;

    let id = "";
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      id = hash.slice(1);
    }

    let frame = 0;
    let attempts = 0;
    const reveal = () => {
      const anchor = id ? document.getElementById(id) : null;
      if (anchor) {
        anchor.scrollIntoView({ block: "start" });
        focusWithoutScroll(anchor);
        return;
      }
      if (id && attempts < ANCHOR_RETRY_FRAMES) {
        attempts += 1;
        frame = requestAnimationFrame(reveal);
        return;
      }
      window.scrollTo(0, 0);
      const heading = document.querySelector<HTMLElement>("h1");
      if (heading) focusWithoutScroll(heading);
    };
    reveal();

    return () => cancelAnimationFrame(frame);
  }, [key, hash, navigationType]);

  return null;
}
