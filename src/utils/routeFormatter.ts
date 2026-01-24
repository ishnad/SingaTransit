interface RouteStep {
    from: string;
    to: string;
    type: 'BUS' | 'MRT' | 'LRT' | 'WALK' | 'TRANSFER';
    service: string;
    weight: number;
}

interface Metadata {
    [key: string]: {
        name: string;
        road?: string;
    }
}

export interface TripLeg {
    type: 'BUS' | 'MRT' | 'LRT' | 'WALK' | 'TRANSFER';
    service: string;
    startStopId: string;
    startStopName: string;
    endStopId: string;
    endStopName: string;
    stopCount: number;
    duration: number;
}

export const formatRoute = (path: RouteStep[], metadata: Metadata): TripLeg[] => {
    if (path.length === 0) return [];

    const legs: TripLeg[] = [];
    
    const getName = (id: string) => metadata[id]?.name || id;

    let currentLeg: TripLeg = {
        type: path[0].type,
        service: path[0].service,
        startStopId: path[0].from,
        startStopName: getName(path[0].from),
        endStopId: path[0].to,
        endStopName: getName(path[0].to),
        stopCount: 1,
        duration: path[0].weight
    };

    for (let i = 1; i < path.length; i++) {
        const step = path[i];

        // Combine steps if same service and same type
        if (step.service === currentLeg.service && step.type === currentLeg.type) {
            currentLeg.endStopId = step.to;
            currentLeg.endStopName = getName(step.to);
            currentLeg.stopCount++;
            currentLeg.duration += step.weight;
        } else {
            legs.push(currentLeg);

            currentLeg = {
                type: step.type,
                service: step.service,
                startStopId: step.from,
                startStopName: getName(step.from),
                endStopId: step.to,
                endStopName: getName(step.to),
                stopCount: 1,
                duration: step.weight
            };
        }
    }
    
    legs.push(currentLeg);

    return legs;
};