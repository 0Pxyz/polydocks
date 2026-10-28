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

export const useNavigationStore = create<NavigationState>((set) => ({
  viewMode: "world",
  activeCityId: null,
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
}));
