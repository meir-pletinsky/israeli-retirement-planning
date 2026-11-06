import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** The open dialogs, oldest first; only the last one reacts to the keyboard. */
const openDialogs: symbol[] = [];

/** Makes everything outside the dialog unreachable, and returns the function that undoes it. */
function inertBackground(dialog: HTMLElement): () => void {
  const marked: Element[] = [];
  for (let node: Element = dialog; node.parentElement; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling !== node && !sibling.hasAttribute("inert")) {
        sibling.setAttribute("inert", "");
        marked.push(sibling);
      }
    }
  }
  return () => marked.forEach((element) => element.removeAttribute("inert"));
}

interface ModalFrameProps {
  /** Called when the user presses Escape. */
  onClose: () => void;
  /** Receives the id the dialog is labelled by; put it on the visible title. */
  children: (titleId: string) => ReactNode;
  panelClassName: string;
  /** Id of the element that describes the dialog, when it has a short explanatory text. */
  describedBy?: string;
}

/**
 * The overlay and panel shared by every dialog: it is announced as a modal dialog named by its
 * title, takes focus when it opens (an element marked `data-autofocus` first), keeps Tab inside,
 * closes on Escape, hides the page behind it and hands focus back to the trigger when it closes.
 */
export function ModalFrame({ onClose, children, panelClassName, describedBy }: ModalFrameProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const id = Symbol("dialog");
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(id);
    const restoreBackground = inertBackground(panel);
    (panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (openDialogs[openDialogs.length - 1] !== id || !panel) return;
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active) || (event.shiftKey && (active === first || active === panel))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      restoreBackground();
      openDialogs.splice(openDialogs.indexOf(id), 1);
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`${panelClassName} focus:outline-none`}
      >
        {children(titleId)}
      </div>
    </div>
  );
}
