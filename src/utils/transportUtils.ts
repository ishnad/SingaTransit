// src/utils/transportUtils.ts

/**
 * Determines the mode of transport based on the service name/code.
 * Shared between UI (MapComponent) and Worker (Pathfinder).
 */
export const getServiceType = (service: string): 'BUS' | 'MRT' | 'LRT' | 'WALK' => {
    if (service === 'WALK') return 'WALK';
    
    // MRT Lines (North South, East West, North East, Circle, Downtown, Thomson-East Coast)
    const mrtLines = ['NSL', 'EWL', 'NEL', 'CCL', 'DTL', 'TEL'];
    if (mrtLines.some(line => service.startsWith(line))) return 'MRT';
    
    // LRT Lines (Bukit Panjang, Sengkang, Punggol)
    const lrtLines = ['BPLrt', 'SKLrt', 'PGLrt', 'LRT']; 
    if (lrtLines.some(line => service.includes(line)) || service.endsWith('LRT')) return 'LRT';
    
    return 'BUS';
};