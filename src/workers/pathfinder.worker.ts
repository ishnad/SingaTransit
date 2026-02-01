import { MinHeap } from '../utils/MinHeap';
import { getServiceType } from '../utils/transportUtils';

interface Edge {
    service: string;
    direction: number;
    distance: number;
    weight: number;
}

interface Graph {
    [key: string]: {
        [key: string]: Edge[];
    };
}

interface PathStep {
    from: string;
    to: string;
    service: string;
    direction: number;
    weight: number;
}

interface PreviousStep {
    node: string;
    edge: Edge;
}

interface RouteOption {
    id: string;
    label: string;
    path: PathStep[];
    totalDuration: number;
}

// CONSTANTS
const BASE_TRANSFER_COST = 300; // 5 minutes base wait time per transfer
const DIRECT_ROUTE_PENALTY = 600; // Additional penalty for "Less Transfers" mode
const WALK_COST_MULTIPLIER = 2.0; // 1 min walk = 2 mins "pain" to prioritize transit

let graph: Graph | null = null;

const initGraph = async () => {
    try {
        const response = await fetch('/data/transit_graph.json');
        graph = await response.json();
        console.log(`Worker: Graph loaded. Nodes: ${Object.keys(graph || {}).length}`);
    } catch (error) {
        console.error('Worker: Failed to load graph', error);
    }
};

initGraph();

// UPDATED: Added excludedModes parameter
const findPath = (
    startNode: string, 
    endNode: string, 
    transferPenalty: number = 0,
    excludedModes: Set<string> = new Set()
) => {
    if (!graph) return { error: 'Graph not loaded' };
    if (!graph[startNode]) return { error: `Start Node ${startNode} not found` };
    if (!graph[endNode]) return { error: `End Node ${endNode} not found` };

    const distances: { [key: string]: number } = {};
    const previous: { [key: string]: PreviousStep | null } = {};
    const pq = new MinHeap<string>();

    distances[startNode] = 0;
    pq.push(startNode, 0);

    const visited = new Set<string>();
    let iterations = 0;
    const MAX_ITERATIONS = 100000; 

    try {
        while (pq.length > 0) {
            iterations++;
            if (iterations > MAX_ITERATIONS) return { error: 'Computation timed out' };

            const current = pq.pop();
            if (!current) break;
            const u = current.element;

            if (current.priority > (distances[u] ?? Infinity)) continue;
            if (u === endNode) break;
            
            if (visited.has(u)) continue;
            visited.add(u);

            const neighbors = graph[u];
            if (!neighbors) continue;

            const incomingStep = previous[u];
            const incomingService = incomingStep ? incomingStep.edge.service : null;

            for (const [v, edges] of Object.entries(neighbors)) {
                if (!edges || edges.length === 0) continue;

                let bestEdge: Edge | null = null;
                let bestCost = Infinity;

                for (const edge of edges) {
                    // --- NEW: FILTERING LOGIC ---
                    const mode = getServiceType(edge.service);
                    // If mode is excluded AND it's not walking, skip it.
                    if (mode !== 'WALK' && excludedModes.has(mode)) {
                        continue;
                    }
                    // ----------------------------

                    let weight = edge.weight;

                    if (edge.service === 'WALK') {
                        weight *= WALK_COST_MULTIPLIER;
                    }

                    let penalty = 0;
                    if (incomingService && incomingService !== edge.service) {
                        penalty = BASE_TRANSFER_COST + transferPenalty;
                    }

                    const currentEdgeCost = weight + penalty;
                    
                    if (currentEdgeCost < bestCost) {
                        bestCost = currentEdgeCost;
                        bestEdge = edge;
                    }
                }

                if (!bestEdge) continue;

                const alt = current.priority + bestCost;

                if (alt < (distances[v] || Infinity)) {
                    distances[v] = alt;
                    previous[v] = { node: u, edge: bestEdge! };
                    pq.push(v, alt);
                }
            }
        }
    } catch (err: any) {
        return { error: `Worker Error: ${err.message}` };
    }

    if (startNode !== endNode && !previous[endNode]) {
        return { error: 'No path found' };
    }

    const path: PathStep[] = [];
    let curr: string | null = endNode;
    let stepCount = 0;
    let trueDuration = 0;

    while (curr !== null) {
        if (stepCount++ > 2000) return { error: 'Path reconstruction error' };
        if (curr === startNode) break;

        const step: PreviousStep | null | undefined = previous[curr];
        if (!step) break;

        path.unshift({
            from: step.node,
            to: curr,
            service: step.edge.service,
            direction: step.edge.direction,
            weight: step.edge.weight
        });
        
        trueDuration += step.edge.weight;
        curr = step.node;
    }

    return { path, totalDuration: trueDuration };
};

const pathsAreEqual = (pathA: PathStep[], pathB: PathStep[]) => {
    if (pathA.length !== pathB.length) return false;
    for (let i = 0; i < pathA.length; i++) {
        if (pathA[i].from !== pathB[i].from || 
            pathA[i].to !== pathB[i].to || 
            pathA[i].service !== pathB[i].service) {
            return false;
        }
    }
    return true;
};

self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;
    if (type === 'CALCULATE') {
        if (!graph) {
            self.postMessage({ type: 'ERROR', error: 'Graph not ready' });
            return;
        }

        // Extract exclusions from payload
        // payload.excludedModes is expected to be an array of strings (e.g. ['BUS', 'MRT'])
        const excludedModes = new Set<string>(payload.excludedModes || []);

        // 1. Calculate Fastest Route
        const fastestResult = findPath(payload.start, payload.end, 0, excludedModes);
        
        if (fastestResult.error) {
            self.postMessage({ type: 'RESULT', result: { error: fastestResult.error } });
            return;
        }

        const routes: RouteOption[] = [];
        
        // Add Fastest
        if (fastestResult.path) {
            routes.push({
                id: 'fastest',
                label: 'Fastest',
                path: fastestResult.path,
                totalDuration: fastestResult.totalDuration
            });
        }

        // 2. Calculate Direct Route (Less Transfers)
        // We only try to find a "direct" route if we found a fastest one first.
        if (fastestResult.path) {
            const directResult = findPath(payload.start, payload.end, DIRECT_ROUTE_PENALTY, excludedModes);
            
            if (!directResult.error && directResult.path) {
                const isDifferent = !pathsAreEqual(fastestResult.path, directResult.path);
                
                if (isDifferent) {
                    routes.push({
                        id: 'direct',
                        label: 'Less Transfers',
                        path: directResult.path,
                        totalDuration: directResult.totalDuration
                    });
                }
            }
        }

        self.postMessage({ type: 'RESULT', result: { routes } });
    }
};