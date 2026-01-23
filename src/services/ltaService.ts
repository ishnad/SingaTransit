import axios from 'axios';

export interface NextBus {
    OriginCode: string;
    DestinationCode: string;
    EstimatedArrival: string; // ISO String (e.g., "2023-10-25T14:00:00+08:00")
    Latitude: string;
    Longitude: string;
    VisitNumber: string;
    Load: string; // "SEA" (Seats Available), "SDA" (Standing), "LSD" (Limited)
    Feature: string; // "WAB" (Wheelchair)
    Type: string; // "SD" (Single Deck), "DD" (Double)
}

export interface ServiceArrival {
    ServiceNo: string;
    Operator: string;
    NextBus: NextBus;
    NextBus2: NextBus;
    NextBus3: NextBus;
}

export const fetchArrivals = async (busStopCode: string): Promise<ServiceArrival[]> => {
    try {
        // FIX: Updated to v3 API as per LTA Documentation v6.6
        // The proxy '/lta-api' maps to 'https://datamall2.mytransport.sg/ltaodataservice'
        // So this becomes '.../ltaodataservice/v3/BusArrival'
        const response = await axios.get(`/lta-api/v3/BusArrival`, {
            params: { BusStopCode: busStopCode }
        });
        
        return response.data.Services || [];
    } catch (error) {
        console.error("Failed to fetch arrivals:", error);
        return [];
    }
};

// Utility to calculate minutes until arrival
export const getMinutesToArrival = (isoString: string): number => {
    if (!isoString) return -1;
    const arrival = new Date(isoString);
    const now = new Date();
    const diffMs = arrival.getTime() - now.getTime();
    const minutes = Math.floor(diffMs / 60000);
    return minutes < 0 ? 0 : minutes;
};