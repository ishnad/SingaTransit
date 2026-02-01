import { formatRoute } from './routeFormatter';
import { getServiceType } from './transportUtils';
import type { RouteOption, ProcessedRoute, Metadata, RouteSegment, PathStep } from '../types/transport';

export const processRoutes = (rawRoutes: RouteOption[], metadata: Metadata): ProcessedRoute[] => {
  return rawRoutes.map((route) => {
    // 1. Generate Text Instructions (Legs)
    const legs = formatRoute(route.path, metadata);

    // 2. Generate Map Segments (Polylines)
    const segments = generateSegments(route.path, metadata);

    // 3. Generate Summary
    const durationMins = Math.ceil(route.totalDuration / 60);
    
    // Calculate Arrival Time (now + duration)
    const arrivalDate = new Date(new Date().getTime() + route.totalDuration * 1000);
    const arrivalTime = arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Extract unique modes for icons (excluding WALK usually, or keeping it)
    const modes = Array.from(new Set(legs.map(l => l.type).filter(t => t !== 'WALK')));
    
    // Count transfers (legs - 1, but strictly transit legs?)
    // Using legs.length - 1 excludes the initial start, but if walking is involved it might be accurate.
    // A better metric might be number of non-walk legs minus 1? 
    // For now, let's just say number of transit legs.
    const transitLegs = legs.filter(l => l.type !== 'WALK').length;
    const transferCount = Math.max(0, transitLegs - 1);

    return {
      id: route.id,
      raw: route,
      legs,
      segments,
      summary: {
        duration: durationMins,
        arrivalTime,
        modes,
        transferCount
      }
    };
  });
};

// Helper: Extracted from MapComponent to generate polyline segments
const generateSegments = (path: PathStep[], metadata: Metadata): RouteSegment[] => {
  if (!path || path.length === 0) return [];

  const segments: RouteSegment[] = [];
  
  // Initialize with the starting point of the first step
  const firstNode = metadata[path[0].from];
  if (!firstNode) return [];

  let currentService = path[0].service;
  let currentPoints: [number, number][] = [[firstNode.lat, firstNode.lng]];
  let currentType = getServiceType(currentService);

  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const nextNode = metadata[step.to];
    
    if (!nextNode) continue;

    const nextPoint: [number, number] = [nextNode.lat, nextNode.lng];

    if (step.service !== currentService) {
      // Service changed, finalize current segment
      if (currentPoints.length > 0) {
        segments.push({
          type: currentType, // 'BUS', 'MRT', etc.
          mode: currentType as any, // mapping string to TransportMode
          service: currentService,
          positions: currentPoints
        });
      }

      // Start new segment
      // The start of the new segment is the end of the last one (continuity)
      // We grab the last point of the previous segment or the start of this step
      const startNode = metadata[step.from];
      const startPoint: [number, number] = startNode ? [startNode.lat, startNode.lng] : nextPoint; // Fallback

      currentService = step.service;
      currentType = getServiceType(currentService);
      currentPoints = [startPoint, nextPoint];
    } else {
      // Continue same service
      currentPoints.push(nextPoint);
    }
  }

  // Push final segment
  if (currentPoints.length > 0) {
    segments.push({
      type: currentType,
      mode: currentType as any,
      service: currentService,
      positions: currentPoints
    });
  }

  return segments;
};