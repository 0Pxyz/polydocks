/**
 * Plugin sandbox UI kit entry. Bundled at build time (bun scripts/build-plugin-kit.ts)
 * into server/plugin-kit/kit.bundle.js and inlined into every React plugin srcdoc.
 * The iframe keeps origin isolation (no allow-same-origin, no external scripts).
 */
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { jsxDEV } from "react/jsx-dev-runtime";

export { React, ReactDOMClient, jsx, jsxs, jsxDEV, Fragment };

export * from "@/components/ui/badge";
export * from "@/components/ui/button";
export * from "@/components/ui/command";
export * from "@/components/ui/dialog";
export * from "@/components/ui/dropdown-menu";
export * from "@/components/ui/input";
export * from "@/components/ui/popover";
export * from "@/components/ui/progress";
export * from "@/components/ui/scroll-area";
export * from "@/components/ui/separator";
export * from "@/components/ui/sheet";
export * from "@/components/ui/skeleton";
export * from "@/components/ui/slider";
export * from "@/components/ui/sonner";
export * from "@/components/ui/tabs";
export * from "@/components/ui/textarea";
export * from "@/components/ui/tooltip";
