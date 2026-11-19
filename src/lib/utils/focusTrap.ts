/**
 * Svelte action that traps keyboard focus inside a modal dialog container.
 * - Restricts Tab and Shift+Tab navigation strictly to focusable elements inside the dialog.
 * - Wraps from the last element back to the first on Tab, and from first to last on Shift+Tab.
 * - Traps any stray window focusin back into the dialog.
 * - Auto-focuses [data-autofocus], first input/textarea, or first focusable element.
 * - Restores focus to the previously active element upon closing/unmounting.
 */
export function focusTrap(node: HTMLElement, enabled = true) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      update() {},
      destroy() {},
    };
  }

  let previousActiveEl: HTMLElement | null = null;

  function getFocusableElements(): HTMLElement[] {
    return Array.from(
      node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => {
      return el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden";
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!enabled || e.key !== "Tab") return;

    const focusables = getFocusableElements();
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !node.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !node.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function handleFocusIn(e: FocusEvent) {
    if (!enabled) return;
    if (!node.contains(e.target as Node)) {
      const focusables = getFocusableElements();
      if (focusables.length > 0) {
        e.preventDefault();
        focusables[0].focus();
      }
    }
  }

  function activate() {
    previousActiveEl = document.activeElement as HTMLElement | null;
    window.addEventListener("keydown", handleKeydown, true);
    window.addEventListener("focusin", handleFocusIn, true);

    setTimeout(() => {
      if (!enabled) return;
      const customAuto = node.querySelector<HTMLElement>("[data-autofocus]");
      if (customAuto) {
        customAuto.focus();
        return;
      }
      const firstInput = node.querySelector<HTMLElement>(
        "input:not([disabled]), textarea:not([disabled])",
      );
      if (firstInput) {
        firstInput.focus();
        return;
      }
      const focusables = getFocusableElements();
      if (focusables.length > 0) {
        focusables[0].focus();
      }
    }, 30);
  }

  function deactivate() {
    window.removeEventListener("keydown", handleKeydown, true);
    window.removeEventListener("focusin", handleFocusIn, true);
    if (previousActiveEl && typeof previousActiveEl.focus === "function") {
      previousActiveEl.focus();
      previousActiveEl = null;
    }
  }

  if (enabled) activate();

  return {
    update(newEnabled: boolean) {
      if (newEnabled && !enabled) {
        enabled = true;
        activate();
      } else if (!newEnabled && enabled) {
        enabled = false;
        deactivate();
      }
    },
    destroy() {
      if (enabled) deactivate();
    },
  };
}
