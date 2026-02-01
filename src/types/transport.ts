export type TransportMode = 'BUS' | 'MRT' | 'LRT' | 'TRAIN' | 'TRAM' | 'WALK';

export const TRANSPORT_MODES = [
  { id: 'BUS', label: 'Bus' },
  { id: 'MRT', label: 'MRT' },  // Changed from SUBWAY to MRT
  { id: 'LRT', label: 'LRT' },
  // { id: 'TRAIN', label: 'Train' }, // Optional: Add if needed
  // { id: 'TRAM', label: 'Tram' },   // Optional: Add if needed
] as const;

export type SortOption = 'FASTEST' | 'LESS_TRANSFERS' | 'LESS_WALKING';

export const SORT_OPTIONS = [
  { id: 'FASTEST', label: 'Fastest' },
  { id: 'LESS_TRANSFERS', label: 'Less Transfers' },
  { id: 'LESS_WALKING', label: 'Less Walking' },
] as const;

export interface RouteSegment {
  mode: TransportMode; 
  service: string;
  duration?: number; // in seconds
  distance?: number; // in meters
  positions: [number, number][]; // Lat/Lng array for map
  type?: string; 
}

export interface Route {
  id: string;
  segments: RouteSegment[];
  totalDuration: number;
  totalDistance: number;
  numberOfTransfers: number;
  walkingDistance: number;
}

export interface Metadata {
  [key: string]: {
    name: string;
    road: string;
    type?: 'BUS' | 'MRT' | 'LRT';
    lat: number;
    lng: number;
  };
}

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

export interface PathStep {
  from: string;
  to: string;
  service: string;
  weight: number;
  direction?: number;
}

export interface RouteOption {
  id: string;
  label: string; 
  path: PathStep[];
  totalDuration: number;
}

export interface RouteSummary {
  duration: number; 
  arrivalTime: string; 
  modes: string[]; 
  transferCount: number;
  cost?: number; 
}

export interface ProcessedRoute {
  id: string;
  summary: RouteSummary;
  legs: TripLeg[]; 
  segments: RouteSegment[]; 
  raw: RouteOption; 
}