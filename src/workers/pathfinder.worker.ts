import { MinHeap } from '../utils/MinHeap';

// Updated Types to include LRT
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

const findPath = (startNode: string, endNode: string) => {
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
    const MAX_ITERATIONS = 60000; 

    while (pq.length > 0) {
        iterations++;
        if (iterations > MAX_ITERATIONS) return { error: 'Timeout' };

        const current = pq.pop();
        if (!current) break;
        
        const u = current.element;
        const currentDist = current.priority;

        if (currentDist > (distances[u] ?? Infinity)) continue;
        if (u === endNode) break;
        if (visited.has(u)) continue;
        visited.add(u);

        const neighbors = graph[u];
        if (!neighbors) continue;

        for (const [v, edges] of Object.entries(neighbors)) {
            if (!edges || edges.length === 0) continue;

            const bestEdge = edges.reduce((prev, curr) => prev.weight < curr.weight ? prev : curr);
            
            // Transfer Penalty logic
            let penalty = 0;
            const prevStep = previous[u];
            if (prevStep) {
                const prevEdge = prevStep.edge;
                // Penalize switching services (e.g. Bus 10 -> Bus 12) or Modes (Bus -> MRT)
                if (prevEdge.service !== bestEdge.service || prevEdge.type !== bestEdge.type) {
                    penalty = 300; // 5 minute penalty
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

    if (distances[endNode] === undefined) {
        return { error: 'No path found' };
    }

    const path: PathStep[] = [];
    let curr: string | null = endNode;
    let safety = 0;

    while (curr !== null && safety < 1000) {
        safety++;
        if (curr === startNode) break;
        
        const step: PreviousStep | null | undefined = previous[curr];
        
        if (!step) break;

        path.unshift({
            from: step.node,
            to: curr,
            type: step.edge.type,
            service: step.edge.service,
            weight: step.edge.weight
        });
        curr = step.node;
    }

    return { path, totalDuration: distances[endNode] };
};

self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;
    if (type === 'CALCULATE') {
        const result = findPath(payload.start, payload.end);
        self.postMessage({ type: 'RESULT', payload: result });
    }
};