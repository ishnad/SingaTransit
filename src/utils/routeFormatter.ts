interface RouteStep {
    from: string;
    to: string;
    service: string;
    weight: number;
}

interface Metadata {
    [key: string]: {
        name: string;
        road: string;
    }
}

export interface TripLeg {
    type: 'BUS' | 'WALK'; // Currently only BUS, but structure allows expansion
    service: string;
    startStopId: string;
    startStopName: string;
    endStopId: string;
    endStopName: string;
    stopCount: number;
    duration: number; // in seconds
}

export const formatRoute = (path: RouteStep[], metadata: Metadata): TripLeg[] => {
    if (path.length === 0) return [];

    const legs: TripLeg[] = [];
    
    // Initialize first leg
    let currentLeg: TripLeg = {
        type: 'BUS',
        service: path[0].service,
        startStopId: path[0].from,
        startStopName: metadata[path[0].from]?.name || path[0].from,
        endStopId: path[0].to,
        endStopName: metadata[path[0].to]?.name || path[0].to,
        stopCount: 1,
        duration: path[0].weight
    };

    // Iterate starting from second step
    for (let i = 1; i < path.length; i++) {
        const step = path[i];

        // Check if we are continuing on the same service
        if (step.service === currentLeg.service) {
            // Extend current leg
            currentLeg.endStopId = step.to;
            currentLeg.endStopName = metadata[step.to]?.name || step.to;
            currentLeg.stopCount++;
            currentLeg.duration += step.weight;
        } else {
            // Service changed (Transfer), push current leg and start new one
            legs.push(currentLeg);

            currentLeg = {
                type: 'BUS',
                service: step.service,
                startStopId: step.from,
                startStopName: metadata[step.from]?.name || step.from,
                endStopId: step.to,
                endStopName: metadata[step.to]?.name || step.to,
                stopCount: 1,
                duration: step.weight
            };
        }
    }

    // Push the final leg
    legs.push(currentLeg);

    return legs;
};