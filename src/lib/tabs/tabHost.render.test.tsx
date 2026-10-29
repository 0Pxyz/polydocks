import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";

// happy-dom globals must exist before react-dom renders.
const win = new Window({ url: "http://localhost/" });
(globalThis as any).window = win;
(globalThis as any).document = win.document;
(globalThis as any).navigator = win.navigator;
(globalThis as any).HTMLElement = win.HTMLElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { TabHost } from "@/features/dock/TabHost";
import { useTabState, resetTabStateForTests } from "./useTabState";
import { platformStorage } from "@/lib/platform/storage";

const mounts: Record<string, number> = {};

function Probe({ id }: { id: string }) {
  const [v, setV] = useTabState(id, "v", 0);
  useEffect(() => {
    mounts[id] = (mounts[id] ?? 0) + 1;
  }, [id]);
  return (
    <div data-probe={id}>
      v={v}
      <button data-inc={id} onClick={() => setV((x) => x + 1)}>
        inc
      </button>
    </div>
  );
}

function renderHost(activeId: string, ids: string[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (active: string, list: string[]) => {
    act(() => {
      root.render(
        <TabHost
          activeId={active}
          tabs={list.map((id) => ({ id, render: () => <Probe id={id} /> }))}
        />
      );
    });
  };
  render(activeId, ids);
  return { container, root, render };
}

describe("TabHost: hidden, never unmounted (0 remounts)", () => {
  beforeEach(() => {
    resetTabStateForTests();
    platformStorage.removeItem("polymax-tab-state");
    document.body.innerHTML = "";
    for (const k of Object.keys(mounts)) delete mounts[k];
  });

  it("switching A -> B -> A keeps both mounted (hidden, 1 mount each)", () => {
    const { container, root, render } = renderHost("a", ["a", "b"]);
    expect(mounts["a"]).toBe(1);
    expect(mounts["b"]).toBe(1);

    render("b", ["a", "b"]);
    const hiddenA = container.querySelector('[data-tab-host-id="a"]');
    expect(hiddenA?.hasAttribute("hidden")).toBe(true);
    // Both contents stay in the DOM: nothing unmounted.
    expect(container.querySelector('[data-probe="a"]')).not.toBeNull();
    expect(container.querySelector('[data-probe="b"]')).not.toBeNull();

    render("a", ["a", "b"]);
    expect(mounts["a"]).toBe(1);
    expect(mounts["b"]).toBe(1);
    act(() => {
      root.unmount();
    });
  });

  it("useTabState survives hide/show and hibernate-style unmount", () => {
    const { container, root, render } = renderHost("a", ["a", "b"]);
    const inc = container.querySelector('[data-inc="a"]') as HTMLElement;
    act(() => {
      inc.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-probe="a"]')?.textContent).toContain("v=1");

    // Hide, then simulate hibernation (host drops the iframe) and restore.
    render("b", ["a", "b"]);
    render("b", ["b"]);
    expect(container.querySelector('[data-probe="a"]')).toBeNull();
    render("a", ["a", "b"]);
    expect(mounts["a"]).toBe(2);
    expect(container.querySelector('[data-probe="a"]')?.textContent).toContain("v=1");
    act(() => {
      root.unmount();
    });
  });
});
