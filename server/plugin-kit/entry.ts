/**
 * Plugin sandbox UI kit entry. Bundled at build time (bun scripts/build-plugin-kit.ts)
 * into server/plugin-kit/kit.bundle.js and inlined into every React plugin srcdoc.
 * The iframe keeps origin isolation (no allow-same-origin, no external scripts).
 *
 * The bundle assigns window.__polymaxKit explicitly (the iife wrapper drops
 * ESM exports, so re-exports alone would vanish at runtime).
 */
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import { renderToString } from "react-dom/server";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";

/**
 * Dev-variant JSX helper, implemented over the production runtime: the
 * transpiler emits version-hashed jsxDEV_<hash> calls in development, which
 * the kit normalizes to this function. Extra dev args (key, source, self)
 * are accepted and ignored — the element is identical.
 */
function jsxDEV(type: any, props: any, _key?: any, _isStatic?: any, _source?: any, _self?: any) {
  return jsx(type, props);
}

import * as badge from "@/components/ui/badge";
import * as button from "@/components/ui/button";
import * as command from "@/components/ui/command";
import * as dialog from "@/components/ui/dialog";
import * as dropdownMenu from "@/components/ui/dropdown-menu";
import * as input from "@/components/ui/input";
import * as popover from "@/components/ui/popover";
import * as progress from "@/components/ui/progress";
import * as scrollArea from "@/components/ui/scroll-area";
import * as separator from "@/components/ui/separator";
import * as sheet from "@/components/ui/sheet";
import * as skeleton from "@/components/ui/skeleton";
import * as slider from "@/components/ui/slider";
import * as sonner from "@/components/ui/sonner";
import * as tabs from "@/components/ui/tabs";
import * as textarea from "@/components/ui/textarea";
import * as tooltip from "@/components/ui/tooltip";

const UI = {  ...badge,
  ...button,
  ...command,
  ...dialog,
  ...dropdownMenu,
  ...input,
  ...popover,
  ...progress,
  ...scrollArea,
  ...separator,
  ...sheet,
  ...skeleton,
  ...slider,
  ...sonner,
  ...tabs,
  ...textarea,
  ...tooltip,
};

(globalThis as any).__polymaxKit = {
  React,
  // Mutable copy: validation stubs createRoot to capture the root element.
  ReactDOMClient: { ...ReactDOMClient },
  renderToString,
  jsx,
  jsxs,
  jsxDEV,
  Fragment,
  UI,
};
