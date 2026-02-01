import { getServiceType } from './transportUtils';
import type { TripLeg, Metadata, PathStep } from '../types/transport';

export { type TripLeg }; 

export const formatRoute = (path: PathStep[], metadata: Metadata): TripLeg[] => {
  if (path.length === 0) return [];

  const legs: TripLeg[] = [];
  
  // Initialize first leg
  let currentLeg: TripLeg = {
    type: getServiceType(path[0].service),
    service: path[0].service,
    startStopId: path[0].from,
    startStopName: metadata[path[0].from]?.name || path[0].from,
    endStopId: path[0].to,
    endStopName: metadata[path[0].to]?.name || path[0].to,
    stopCount: 1,
    duration: path[0].weight,
  };

  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    const stepType = getServiceType(step.service);

    // Continue leg if service is identical
    if (step.service === currentLeg.service) {
      currentLeg.endStopId = step.to;
      currentLeg.endStopName = metadata[step.to]?.name || step.to;
      currentLeg.stopCount++;
      currentLeg.duration += step.weight;
    } else {
      // Push finished leg
      legs.push(currentLeg);

      // Start new leg
      currentLeg = {
        type: stepType,
        service: step.service,
        startStopId: step.from,
        startStopName: metadata[step.from]?.name || step.from,
        endStopId: step.to,
        endStopName: metadata[step.to]?.name || step.to,
        stopCount: 1,
        duration: step.weight,
      };
    }
  }
  
  // Push the final leg
  legs.push(currentLeg);
  
  return legs;
};