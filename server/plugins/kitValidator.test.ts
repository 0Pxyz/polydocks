import { describe, expect, it } from "bun:test";
import { validateKitUsage, findRawElements, findKitHex, usesKitComponents } from "./kitValidator";

const KIT_OK = `import { Stack, ListRow, EmptyState } from "@/components/ui/kit";
import { Button } from "@/components/ui/button";
import { createRoot } from "react-dom/client";
function App() { return (<Stack gap={16}><ListRow title="Item" onOpen={() => {}} /><Button size="sm">Save</Button></Stack>); }
createRoot(document.getElementById("app")).render(<App />);`;

describe("kitValidator", () => {
  it("rejects raw elements, hex and inline style", () => {
    const bad = `function A(){ return (<div><button>go</button><input /><div style={{color:"#ff0000"}}>x</div></div>); }`;
    expect(findRawElements(bad).length).toBeGreaterThan(0);
    expect(findKitHex(bad)).toEqual(["#ff0000"]);
    expect(usesKitComponents(bad)).toBe(false);
    const r = validateKitUsage(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("raw <button>");
  });

  it("approves kit-composed code without hex or inline style", () => {
    const r = validateKitUsage(KIT_OK);
    expect(r.ok).toBe(true);
  });

  it("rejects React code without kit components, but exempts vanilla plain-script", () => {
    const reactNoKit = `import { useState } from "react";\nimport { createRoot } from "react-dom/client";\nfunction A() { return <div className="bg-card text-foreground">plain</div>; }\ncreateRoot(document.getElementById("app")).render(<A />);`;
    const r = validateKitUsage(reactNoKit);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("no kit components");

    const vanilla = `<div class="bg-card text-foreground">plain</div>`;
    expect(validateKitUsage(vanilla).ok).toBe(true);
  });
});
