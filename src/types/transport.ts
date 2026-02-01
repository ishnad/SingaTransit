export type TransportMode = 'BUS' | 'MRT' | 'LRT' | 'TRAIN' | 'TRAM' | 'WALK';

export const TRANSPORT_MODES = [
  { id: 'BUS', label: 'Bus' },
  { id: 'SUBWAY', label: 'Subway' }, // Keeping original IDs if they were SUBWAY/TRAIN in your code, otherwise aligning to MRT/LRT
  { id: 'TRAIN', label: 'Train' },
  { id: 'TRAM', label: 'Tram' },
] as const;

export type SortOption = 'FASTEST' | 'LESS_TRANSFERS' | 'LESS_WALKING';

export const SORT_OPTIONS = [
  { id: 'FASTEST', label: 'Fastest' },
  { id: 'LESS_TRANSFERS', label: 'Less Transfers' },
  { id: 'LESS_WALKING', label: 'Less Walking' },
] as const;

export interface RouteSegment {
  mode: TransportMode; // or string if dynamic
  service: string;
  duration?: number; // in seconds
  distance?: number; // in meters
  positions: [number, number][]; // Lat/Lng array for map
  type?: string; // Legacy support if needed
}

export interface Route {
  id: string;
  segments: RouteSegment[];
  totalDuration: number;
  totalDistance: number;
  numberOfTransfers: number;
  walkingDistance: number;
}

// --- NEW TYPES FOR UNIFIED ROUTE LIST ---

export interface Metadata {
  [key: string]: {
    name: string;
    road: string;
    type?: 'BUS' | 'MRT' | 'LRT';
    lat: number;
    lng: number;
  };
}

// Previously in routeFormatter.ts
export interface TripLeg {
  type: 'BUS' | 'MRT' | 'LRT' | 'WALK';
  service: string;
  startStopId: string;
  startStopName: string;
  endStopId: string;
  endStopName: string;
  stopCount: number;
  duration: number; // in seconds
}

// Raw output from the Pathfinder Worker
export interface PathStep {
  from: string;
  to: string;
  service: string;
  weight: number;
  direction?: number;
}

export interface RouteOption {
  id: string;
  label: string; // e.g., "Fastest", "Less Transfers"
  path: PathStep[];
  totalDuration: number;
}

export interface RouteSummary {
  duration: number; // Minutes
  arrivalTime: string; // "14:35"
  modes: string[]; // ["BUS", "MRT"] unique list for icons
  transferCount: number;
  cost?: number; // Optional
}

export interface ProcessedRoute {
  id: string;
  summary: RouteSummary;
  legs: TripLeg[]; // For the text itinerary
  segments: RouteSegment[]; // For the map polylines
  raw: RouteOption; // Keep original reference
}
