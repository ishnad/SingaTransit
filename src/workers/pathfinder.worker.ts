import { MinHeap } from '../utils/MinHeap';

// 1. Define Explicit Types
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
    weight: number;
}

interface PreviousStep {
    node: string;
    edge: Edge;
}

// 2. State
let graph: Graph | null = null;

// 3. Initialization
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

// 4. Algorithm
const findPath = (startNode: string, endNode: string) => {
    // DEBUG: Validate Inputs
    console.log(`Worker: Starting Search ${startNode} -> ${endNode}`);
    
    if (!graph) return { error: 'Graph not loaded' };
    if (!graph[startNode]) return { error: `Start Node ${startNode} not found in graph` };
    if (!graph[endNode]) return { error: `End Node ${endNode} not found in graph` };

    const distances: { [key: string]: number } = {};
    const previous: { [key: string]: PreviousStep | null } = {};
    const pq = new MinHeap<string>();

    distances[startNode] = 0;
    pq.push(startNode, 0);

    const visited = new Set<string>();
    
    // SAFETY: Iteration Cap to prevent infinite loops (browser freeze)
    let iterations = 0;
    const MAX_ITERATIONS = 50000; 

    try {
        while (pq.length > 0) {
            iterations++;
            if (iterations > MAX_ITERATIONS) {
                console.error("Worker: Hit MAX_ITERATIONS limit. Aborting.");
                return { error: 'Computation timed out (Possible infinite loop)' };
            }

            const current = pq.pop();
            if (!current) break;

            const u = current.element;
            const currentDist = current.priority;

            // Optimization: If we found a shorter way to 'u' already, skip
            if (currentDist > (distances[u] ?? Infinity)) continue;

            if (u === endNode) {
                console.log(`Worker: Path found after ${iterations} iterations.`);
                break;
            }
            
            if (visited.has(u)) continue;
            visited.add(u);

            const neighbors = graph[u];
            if (!neighbors) continue;

            for (const [v, edges] of Object.entries(neighbors)) {
                if (!edges || edges.length === 0) continue;

                const bestEdge = edges.reduce((prev, curr) => 
                    prev.weight < curr.weight ? prev : curr
                );

                const alt = currentDist + bestEdge.weight;

                if (alt < (distances[v] || Infinity)) {
                    distances[v] = alt;
                    previous[v] = { node: u, edge: bestEdge };
                    pq.push(v, alt);
                }
            }
        }
    } catch (err: any) {
        console.error("Worker CRASH in loop:", err);
        return { error: `Worker Algorithm Crash: ${err.message}` };
    }

    // 5. Path Reconstruction
    if (startNode !== endNode && !previous[endNode]) {
        console.warn("Worker: Finished search but no path found.");
        return { error: 'No path found between these locations' };
    }

    const path: PathStep[] = [];
    let curr: string | null = endNode;
    
    // Safety counter for reconstruction
    let stepCount = 0;

    while (curr !== null) {
        stepCount++;
        if (stepCount > 1000) { // Safety break
             return { error: 'Path reconstruction loop error' };
        }

        if (curr === startNode) break;

        const step: PreviousStep | null | undefined = previous[curr];
        
        if (!step) break;

        path.unshift({
            from: step.node,
            to: curr,
            service: step.edge.service,
            weight: step.edge.weight
        });
        
        curr = step.node;
    }

    return { path, totalDuration: distances[endNode] };
};

// 6. Message Handler
self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'CALCULATE') {
        if (!graph) {
            self.postMessage({ type: 'ERROR', error: 'Graph not ready' });
            return;
        }
        
        console.time('Routing Calculation');
        const result = findPath(payload.start, payload.end);
        console.timeEnd('Routing Calculation');
        
        self.postMessage({ type: 'RESULT', result });
    }
};