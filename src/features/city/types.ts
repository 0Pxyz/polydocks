export interface CitySourceItem {
  id?: string;
  title: string;
  url: string;
  kind?: "article" | "paper" | "video" | "course" | "doc";
  why?: string;
  level?: number;
  domain?: string;
  site?: string | null;
  image?: string | null;
  author?: string | null;
  hook?: string | null;
  publishedAt?: string | null;
  readMinutes?: number | null;
  durationSec?: number | null;
  fullText?: string | null;
}

export interface CityNoteItem {
  name: string;
  path: string;
  content: string;
  updatedAt?: string;
}

export interface CityQuestItem {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  completed?: boolean;
}

export interface CityDynamicTab {
  id: string;
  title: string;
  icon?: string;
  srcdoc?: string;
  scope?: "city" | "global";
}

export interface CityWorkspaceData {
  cityId: string;
  title: string;
  region: string;
  level: number;
  tags: string[];
  notes: CityNoteItem[];
  sources: CitySourceItem[];
  quests: CityQuestItem[];
  dynamicTabs: CityDynamicTab[];
}

export interface CityWorkspaceProps {
  cityId: string;
  activeToolId?: string;
  secondaryToolId?: string | null;
  onSelectTool?: (toolId: string) => void;
  onBackToWorld?: () => void;
  className?: string;
}
