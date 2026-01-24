import { MinHeap } from '../utils/MinHeap';

type TransportType = 'BUS' | 'MRT' | 'LRT' | 'WALK' | 'TRANSFER';

interface Edge {
    type: TransportType;
    service: string; 
    direction?: number;
    distance: number;
    weight: number; 
}

interface Graph {
    [key: string]: {
        [key: string]: Edge[];
    };
}

interface StopMetadata {
    [key: string]: {
        lat: number;
        lng: number;
        name: string;
    }
}

interface PathStep {
    from: string;
    to: string;
    type: TransportType;
    service: string;
    weight: number;
}

interface PreviousStep {
    node: string;
    edge: Edge;
}

interface Coordinates {
    lat: number;
    lng: number;
}

// State
let graph: Graph | null = null;
let metadata: StopMetadata | null = null;

// Initialization
const init = async () => {
    try {
        const [graphRes, metaRes] = await Promise.all([
            fetch('/data/transit_graph.json'),
            fetch('/data/stops_metadata.json')
        ]);
        
        graph = await graphRes.json();
        metadata = await metaRes.json();
        
        console.log(`Worker: Ready. Nodes: ${Object.keys(graph || {}).length}`);
    } catch (error) {
        console.error('Worker: Failed to load data', error);
    }
};

init();

// Helper: Haversine Distance (km)
const getDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

// Find nearest stops within radius (e.g. 800m)
const findNearestNodes = (coords: Coordinates, maxDistKm = 0.8) => {
    if (!metadata) return [];
    const results = [];
    for (const [id, data] of Object.entries(metadata)) {
        const dist = getDist(coords.lat, coords.lng, data.lat, data.lng);
        if (dist <= maxDistKm) {
            results.push({ id, dist });
        }
    }
    return results.sort((a, b) => a.dist - b.dist).slice(0, 5); // Return top 5
};

const findPath = (start: Coordinates, end: Coordinates) => {
    if (!graph || !metadata) return { error: 'Graph not loaded yet' };

    const startNodeID = '__START__';
    const endNodeID = '__END__';

    // 1. Identify Entry/Exit points
    const startNeighbors = findNearestNodes(start);
    const endNeighbors = findNearestNodes(end);

    if (startNeighbors.length === 0) return { error: 'No transport nodes near start location' };
    if (endNeighbors.length === 0) return { error: 'No transport nodes near destination' };

    // 2. Setup Dijkstra
    const distances: { [key: string]: number } = {};
    const previous: { [key: string]: PreviousStep | null } = {};
    const pq = new MinHeap<string>();
    const visited = new Set<string>();

    // 3. Initialize Start Virtual Node
    distances[startNodeID] = 0;
    pq.push(startNodeID, 0);

    // 4. Algorithm
    let iterations = 0;
    const MAX_ITERATIONS = 50000;

    while (pq.length > 0) {
        iterations++;
        if (iterations > MAX_ITERATIONS) return { error: 'Timeout' };

        const current = pq.pop();
        if (!current) break;
        
        const u = current.element;
        const currentDist = current.priority;

        if (currentDist > (distances[u] ?? Infinity)) continue;
        
        // Target Reached?
        if (u === endNodeID) break;

        // VISITED CHECK
        if (visited.has(u)) continue;
        visited.add(u);

        // GET NEIGHBORS
        // Handle Virtual Start Node neighbors
        let neighbors: Record<string, Edge[]> = {};
        
        if (u === startNodeID) {
            // Virtual edges from Start -> Nearby Stations
            startNeighbors.forEach(n => {
                // 5km/h walk speed = 12 mins per km = 720 secs per km
                const walkTime = n.dist * 720; 
                neighbors[n.id] = [{
                    type: 'WALK',
                    service: 'Start',
                    distance: n.dist,
                    weight: walkTime
                }];
            });
        } 
        else if (graph[u]) {
            // Normal Graph Neighbors
            neighbors = graph[u];
            
            // Check if we can walk to End Node from here
            // (We inject the 'End' node as a neighbor to nearby stations)
            const distToEnd = endNeighbors.find(n => n.id === u);
            if (distToEnd) {
                const walkTime = distToEnd.dist * 720;
                // Add virtual edge to End
                if (!neighbors[endNodeID]) neighbors[endNodeID] = [];
                neighbors[endNodeID].push({
                    type: 'WALK',
                    service: 'End',
                    distance: distToEnd.dist,
                    weight: walkTime
                });
            }
        }

        // RELAX EDGES
        for (const [v, edges] of Object.entries(neighbors)) {
            if (!edges || edges.length === 0) continue;

            const bestEdge = edges.reduce((prev, curr) => prev.weight < curr.weight ? prev : curr);
            
            // Penalty Logic
            let penalty = 0;
            const prevStep = previous[u];
            if (prevStep) {
                const prevEdge = prevStep.edge;
                if (prevEdge.service !== bestEdge.service || prevEdge.type !== bestEdge.type) {
                    penalty = 300; // 5 min transfer penalty
                }
            }

            const alt = currentDist + bestEdge.weight + penalty;

            if (alt < (distances[v] || Infinity)) {
                distances[v] = alt;
                previous[v] = { node: u, edge: bestEdge };
                pq.push(v, alt);
            }
        }
    }

    if (distances[endNodeID] === undefined) {
        return { error: 'No path found' };
    }

    // 5. Reconstruct Path
    const path: PathStep[] = [];
    let curr: string | null = endNodeID;
    
    while (curr !== null) {
        if (curr === startNodeID) break;
        const step: PreviousStep | null | undefined = previous[curr];
        if (!step) break;

        path.unshift({
            from: step.node === startNodeID ? 'Current Location' : step.node,
            to: curr === endNodeID ? 'Destination' : curr,
            type: step.edge.type,
            service: step.edge.service,
            weight: step.edge.weight
        });
        curr = step.node;
    }

    return { path, totalDuration: distances[endNodeID] };
};

self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;
    if (type === 'CALCULATE') {
        try {
            // Payload is now { start: {lat, lng}, end: {lat, lng} }
            const result = findPath(payload.start, payload.end);
            self.postMessage({ type: 'RESULT', payload: result });
        } catch (err: any) {
             self.postMessage({ type: 'ERROR', payload: { error: err.message } });
        }
    }
};