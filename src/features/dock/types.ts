export interface DynamicTabManifest {
  id: string;
  title: string;
  icon?: string;
  scope?: "city" | "global";
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export type BridgeAction =
  | "storage.get"
  | "storage.set"
  | "storage.remove"
  | "getContext"
  | "openUrl"
  | "openContent"
  | "submit"
  | "ui.expand"
  | "ui.collapse"
  | "capability.invoke"
  | "runtime.error"
  | "runtime.ready"
  | "ui.ready";

export interface HostBridgeRequest {
  polymaxAction: BridgeAction;
  polymaxRequestId: number;
  key?: string;
  value?: unknown;
  url?: string;
  command?: string;
  capabilityId?: string;
  input?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

export interface HostBridgeResponse {
  polymaxResponseId: number;
  result?: unknown;
  error?: string;
}

export interface HostBridgeOptions {
  cityId: string;
  tabId: string;
  workspaceId?: string;
  pluginId?: string;
  storagePrefix?: string;
  allowedCapabilities?: string[];
  onReady?: () => void;
  onError?: (error: unknown) => void;
  onInvoke?: (capabilityId: string, input: unknown) => Promise<unknown> | unknown;
  onExpand?: () => void;
  onCollapse?: () => void;
  onSubmitCommand?: (command: string) => void;
  onOpenUrl?: (url: string) => void;
  onOpenContent?: (url: string) => void;
  getContext?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
}
