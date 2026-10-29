import { CityWorkspace } from "@/features/city/CityWorkspace";

interface CityViewProps {
  cityName: string;
  activeToolId?: string;
  secondaryToolId?: string | null;
  onSelectTool?: (toolId: string) => void;
}

export function CityView({ cityName, activeToolId, secondaryToolId, onSelectTool }: CityViewProps) {
  return <CityWorkspace cityId={cityName} activeToolId={activeToolId} secondaryToolId={secondaryToolId} onSelectTool={onSelectTool} />;
}
