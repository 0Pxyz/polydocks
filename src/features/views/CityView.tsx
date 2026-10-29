import { CityWorkspace } from "@/features/city/CityWorkspace";

interface CityViewProps {
  cityName: string;
  activeToolId?: string;
  onSelectTool?: (toolId: string) => void;
}

export function CityView({ cityName, activeToolId, onSelectTool }: CityViewProps) {
  return <CityWorkspace cityId={cityName} activeToolId={activeToolId} onSelectTool={onSelectTool} />;
}
