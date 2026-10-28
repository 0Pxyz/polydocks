import { useState, useCallback } from "react";
import type { CityBuildEvent } from "@/features/world/types";

export interface BuildingState {
  progress: number;
  stage: string;
  status: "idle" | "building" | "ready" | "error";
  error?: string;
}

export function useCityBuildStream() {
  const [buildingProgress, setBuildingProgress] = useState<Record<string, number>>({});
  const [activeBuilds, setActiveBuilds] = useState<Record<string, BuildingState>>({});

  const startCityBuild = useCallback(
    (cityId: string, topic: string, depth = "deep", onComplete?: () => void) => {
      const url = `/api/cities/${encodeURIComponent(cityId)}/build/stream?topic=${encodeURIComponent(topic)}&depth=${encodeURIComponent(depth)}`;

      setActiveBuilds((prev) => ({
        ...prev,
        [cityId]: { progress: 0.05, stage: "discovery", status: "building" },
      }));
      setBuildingProgress((prev) => ({ ...prev, [cityId]: 0.05 }));

      const eventSource = new EventSource(url);

      eventSource.addEventListener("stage.start", (e: MessageEvent) => {
        try {
          const ev = JSON.parse(e.data) as CityBuildEvent;
          const prog = ev.progress ?? 0.1;
          setBuildingProgress((prev) => ({ ...prev, [cityId]: prog }));
          setActiveBuilds((prev) => ({
            ...prev,
            [cityId]: { progress: prog, stage: ev.stage || "building", status: "building" },
          }));
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener("source.found", (e: MessageEvent) => {
        try {
          const ev = JSON.parse(e.data) as CityBuildEvent;
          const prog = ev.progress ?? 0.3;
          setBuildingProgress((prev) => ({ ...prev, [cityId]: prog }));
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener("concept.extracted", (e: MessageEvent) => {
        try {
          const ev = JSON.parse(e.data) as CityBuildEvent;
          const prog = ev.progress ?? 0.6;
          setBuildingProgress((prev) => ({ ...prev, [cityId]: prog }));
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener("quest.created", (e: MessageEvent) => {
        try {
          const ev = JSON.parse(e.data) as CityBuildEvent;
          const prog = ev.progress ?? 0.85;
          setBuildingProgress((prev) => ({ ...prev, [cityId]: prog }));
        } catch {
          // ignore
        }
      });

      eventSource.addEventListener("city.ready", () => {
        setBuildingProgress((prev) => ({ ...prev, [cityId]: 1.0 }));
        setActiveBuilds((prev) => ({
          ...prev,
          [cityId]: { progress: 1.0, stage: "ready", status: "ready" },
        }));
      });

      eventSource.addEventListener("done", () => {
        eventSource.close();
        if (onComplete) onComplete();
      });

      eventSource.addEventListener("error", (err) => {
        console.warn("[CityBuildStream] SSE closed or error:", err);
        eventSource.close();
        setActiveBuilds((prev) => ({
          ...prev,
          [cityId]: { ...prev[cityId], status: "ready", progress: 1.0 },
        }));
        setBuildingProgress((prev) => ({ ...prev, [cityId]: 1.0 }));
        if (onComplete) onComplete();
      });
    },
    []
  );

  return {
    buildingProgress,
    activeBuilds,
    startCityBuild,
  };
}
