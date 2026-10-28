export interface Position2D {
  x: number;
  y: number;
}

export interface RoadConnection {
  fromCityId: string;
  toCityId: string;
  distance: number;
  kind: "highway" | "trail" | "bridge";
}

export interface CitySpec {
  id: string;
  title: string;
  regionId: string;
  level: number;
  position: Position2D;
  tags: string[];
  description?: string;
  questCount?: number;
}

export interface RegionSpec {
  id: string;
  title: string;
  topic: string;
  center: Position2D;
  radius: number;
  color: string;
  accentColor: string;
  cities: string[];
}

export interface MapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface MapGenOptions {
  seed?: string;
  citiesPerRegion?: number;
  canvasRadius?: number;
  minCityDistance?: number;
}

export interface MapSpec {
  seed: string;
  title: string;
  regions: RegionSpec[];
  cities: CitySpec[];
  connections: RoadConnection[];
  bounds: MapBounds;
  createdAt: string;
}
