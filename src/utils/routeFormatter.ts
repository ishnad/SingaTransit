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
    type: 'BUS' | 'MRT' | 'LRT' | 'WALK';
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
    
    // Helper to categorize service type based on line names or keywords
    const getServiceType = (service: string): 'BUS' | 'MRT' | 'LRT' | 'WALK' => {
        if (service === 'WALK') return 'WALK';
        
        // MRT Lines (North South, East West, North East, Circle, Downtown, Thomson-East Coast)
        const mrtLines = ['NSL', 'EWL', 'NEL', 'CCL', 'DTL', 'TEL'];
        if (mrtLines.some(line => service.startsWith(line))) return 'MRT';
        
        // LRT Lines (Bukit Panjang, Sengkang, Punggol)
        const lrtLines = ['BPLrt', 'SKLrt', 'PGLrt', 'LRT']; 
        if (lrtLines.some(line => service.includes(line)) || service.endsWith('LRT')) return 'LRT';
        
        return 'BUS';
    };

    // Initialize first leg
    let currentLeg: TripLeg = {
        type: getServiceType(path[0].service),
        service: path[0].service,
        startStopId: path[0].from,
        startStopName: metadata[path[0].from]?.name || path[0].from,
        endStopId: path[0].to,
        endStopName: metadata[path[0].to]?.name || path[0].to,
        stopCount: 1,
        duration: path[0].weight
    };

    for (let i = 1; i < path.length; i++) {
        const step = path[i];
        const stepType = getServiceType(step.service);

        // Continue leg if service is identical
        // Note: For walking, we group continuous walking segments
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
                duration: step.weight
            };
        }
    }

    legs.push(currentLeg);
    return legs;
};