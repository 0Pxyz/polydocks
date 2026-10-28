import { CityWorkspace } from "@/features/city/CityWorkspace";

interface CityViewProps {
  cityName: string;
  onBackToWorld: () => void;
  activeToolId?: string;
  onSelectTool?: (toolId: string) => void;
}

export function CityView({
  cityName,
  onBackToWorld,
  activeToolId,
  onSelectTool,
}: CityViewProps) {
  return (
    <CityWorkspace
      cityId={cityName}
      activeToolId={activeToolId}
      onSelectTool={onSelectTool}
      onBackToWorld={onBackToWorld}
    />
  );
}
