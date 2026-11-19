import { describe, expect, it, vi } from "vitest";
import { focusTrap } from "./focusTrap";

describe("focusTrap action", () => {
  it("safely handles server-side execution without window or document", () => {
    const mockNode = {} as HTMLElement;
    const trap = focusTrap(mockNode, true);
    expect(trap).toBeDefined();
    expect(typeof trap.destroy).toBe("function");
    trap.destroy();
  });

  it("registers listeners when window and document are present", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const origWindow = globalThis.window;
    const origDocument = globalThis.document;

    // Set mock window and document
    Object.defineProperty(globalThis, "window", {
      value: { addEventListener, removeEventListener } as unknown as Window,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: { activeElement: null } as unknown as Document,
      configurable: true,
      writable: true,
    });

    const mockNode = {
      querySelectorAll: vi.fn().mockReturnValue([]),
      querySelector: vi.fn().mockReturnValue(null),
      contains: vi.fn().mockReturnValue(true),
    } as unknown as HTMLElement;

    const trap = focusTrap(mockNode, true);
    expect(addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    expect(addEventListener).toHaveBeenCalledWith("focusin", expect.any(Function), true);

    trap.destroy();
    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    expect(removeEventListener).toHaveBeenCalledWith("focusin", expect.any(Function), true);

    Object.defineProperty(globalThis, "window", {
      value: origWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: origDocument,
      configurable: true,
      writable: true,
    });
  });
});
