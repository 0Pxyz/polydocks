import { create } from "zustand";

export type ViewMode = "world" | "city";

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface NavigationState {
  viewMode: ViewMode;
  activeCityId: string | null;
  camera: CameraState;

  enterCity: (cityId: string) => void;
  exitToWorld: () => void;
  setCamera: (camera: Partial<CameraState>) => void;
  resetCamera: () => void;
}

const DEFAULT_CAMERA: CameraState = {
  x: 0,
  y: 0,
  zoom: 1,
};

/**
 * Deep link: ?city=<id> boots straight into a city (shareable links,
 * smoke tests). Invalid/empty values fall back to the world view.
 */
function initialCityFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = new URLSearchParams(window.location.search).get("city");
    return id && id.trim().length > 0 ? id.trim() : null;
  } catch {
    return null;
  }
}

export const useNavigationStore = create<NavigationState>((set) => {
  const bootCityId = initialCityFromUrl();
  return {
    viewMode: bootCityId ? "city" : "world",
    activeCityId: bootCityId,
  camera: DEFAULT_CAMERA,

  enterCity: (cityId: string) =>
    set({
      viewMode: "city",
      activeCityId: cityId,
    }),

  exitToWorld: () =>
    set({
      viewMode: "world",
      activeCityId: null,
    }),

  setCamera: (updates) =>
    set((state) => ({
      camera: {
        ...state.camera,
        ...updates,
      },
    })),

  resetCamera: () =>
    set({
      camera: DEFAULT_CAMERA,
    }),
  };
});
