import { filterAndSortRoutes } from '../routeUtils';
import type { Route, TransportMode, SortOption } from '../../types/transport';

// Mock Data
const trainRoute: Route = { 
  id: '1', 
  segments: [{ mode: 'TRAIN', duration: 100, distance: 1000 }], 
  totalDuration: 100, 
  totalDistance: 1000, 
  numberOfTransfers: 0, 
  walkingDistance: 500 
};

const busRoute: Route = { 
  id: '2', 
  segments: [{ mode: 'BUS', duration: 200, distance: 2000 }], 
  totalDuration: 200, 
  totalDistance: 2000, 
  numberOfTransfers: 1, 
  walkingDistance: 100 
};

describe('filterAndSortRoutes', () => {
  it('should filter out routes containing excluded modes', () => {
    const routes = [trainRoute, busRoute];
    const excludedModes = new Set<TransportMode>(['BUS']);
    const sortOption: SortOption = 'FASTEST';

    const result = filterAndSortRoutes(routes, excludedModes, sortOption);
    
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1'); // Should keep train
  });

  it('should sort by LESS_TRANSFERS', () => {
    const routeA = { ...trainRoute, numberOfTransfers: 2, totalDuration: 10 };
    const routeB = { ...busRoute, numberOfTransfers: 1, totalDuration: 20 };
    
    // Note: trainRoute (A) has 2 transfers, busRoute (B) has 1
    const result = filterAndSortRoutes([routeA, routeB], new Set(), 'LESS_TRANSFERS');
    
    expect(result[0].id).toBe('2'); // RouteB (1 transfer) comes before RouteA (2 transfers)
  });

   it('should sort by LESS_WALKING', () => {
    // trainRoute has 500m walking, busRoute has 100m walking
    const result = filterAndSortRoutes([trainRoute, busRoute], new Set(), 'LESS_WALKING');
    
    expect(result[0].id).toBe('2'); // busRoute (100m) comes before trainRoute (500m)
  });

  it('should sort by FASTEST', () => {
    // trainRoute duration 100, busRoute duration 200
    const result = filterAndSortRoutes([trainRoute, busRoute], new Set(), 'FASTEST');
    
    expect(result[0].id).toBe('1');
  });
});