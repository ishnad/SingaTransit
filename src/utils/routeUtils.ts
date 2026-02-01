import type { Route, TransportMode, SortOption } from '../types/transport';

export const filterAndSortRoutes = (
  routes: Route[],
  excludedModes: Set<TransportMode>,
  sortOption: SortOption
): Route[] => {
  // 1. Filter: Remove routes that contain any excluded mode
  // Note: Walking segments are ignored during filtering (always allowed)
  const filtered = routes.filter(route => {
    return !route.segments.some(segment => 
      segment.mode !== 'WALKING' && excludedModes.has(segment.mode as TransportMode)
    );
  });

  // 2. Sort: Order routes based on the selected option
  return filtered.sort((a, b) => {
    switch (sortOption) {
      case 'LESS_TRANSFERS':
        // Primary: Number of transfers (Ascending)
        if (a.numberOfTransfers !== b.numberOfTransfers) {
          return a.numberOfTransfers - b.numberOfTransfers;
        }
        // Secondary: Duration (Ascending)
        return a.totalDuration - b.totalDuration;

      case 'LESS_WALKING':
        // Primary: Walking distance (Ascending)
        if (a.walkingDistance !== b.walkingDistance) {
          return a.walkingDistance - b.walkingDistance;
        }
        // Secondary: Duration (Ascending)
        return a.totalDuration - b.totalDuration;

      case 'FASTEST':
      default:
        // Primary: Total Duration (Ascending)
        return a.totalDuration - b.totalDuration;
    }
  });
};