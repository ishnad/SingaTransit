export interface HeapNode<T> {
    element: T;
    priority: number;
}

export class MinHeap<T> {
    private heap: HeapNode<T>[];

    constructor() {
        this.heap = [];
    }

    get length(): number {
        return this.heap.length;
    }

    public push(element: T, priority: number): void {
        const node: HeapNode<T> = { element, priority };
        this.heap.push(node);
        this.bubbleUp(this.heap.length - 1);
    }

    public pop(): HeapNode<T> | undefined {
        if (this.heap.length === 0) return undefined;
        
        const min = this.heap[0];
        const last = this.heap.pop();
        
        if (this.heap.length > 0 && last) {
            this.heap[0] = last;
            this.bubbleDown(0);
        }
        
        return min;
    }

    private bubbleUp(index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[parentIndex].priority <= this.heap[index].priority) break;
            
            [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
            index = parentIndex;
        }
    }

    private bubbleDown(index: number): void {
        while (true) {
            let leftChild = 2 * index + 1;
            let rightChild = 2 * index + 2;
            let smallest = index;

            if (leftChild < this.heap.length && this.heap[leftChild].priority < this.heap[smallest].priority) {
                smallest = leftChild;
            }

            if (rightChild < this.heap.length && this.heap[rightChild].priority < this.heap[smallest].priority) {
                smallest = rightChild;
            }

            if (smallest === index) break;

            [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
            index = smallest;
        }
    }
}