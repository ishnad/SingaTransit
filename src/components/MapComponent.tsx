import React, { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import PathfinderWorker from '../workers/pathfinder.worker?worker';
import { fetchArrivals, type ServiceArrival } from '../services/ltaService';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { LocationSearch } from './LocationSearch';
import { RouteOptionsBar } from './RouteOptions/RouteOptionsBar';
import { RouteList } from './RouteList/RouteList';
import { processRoutes } from '../utils/routeProcessor';
import type { 
    SortOption, 
    TransportMode, 
    Metadata, 
    RouteOption, 
    ProcessedRoute,
    RouteSegment
} from '../types/transport';

// Icons setup
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const SINGAPORE_CENTER: [number, number] = [1.3521, 103.8198];

interface SavedPlace {
    id: string;
    stopId: string;
    label: string;
}

interface CustomLocation {
    id: string;
    name: string;
    lat: number;
    lng: number;
    road: string;
}

const MapComponent: React.FC = () => {
    // 1. Core State
    const [metadata, setMetadata] = useState<Metadata | null>(null);
    const [stats, setStats] = useState<string>("Initializing...");

    // 2. Route State
    const [processedRoutes, setProcessedRoutes] = useState<ProcessedRoute[]>([]);
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

    // 3. Filters & Inputs
    const [excludedModes, setExcludedModes] = useState<Set<TransportMode>>(new Set());
    const [activeSort, setActiveSort] = useState<SortOption>('FASTEST');
    const [startId, setStartId] = useState('84009'); // Bedok
    const [endId, setEndId] = useState('01012'); // Hotel Grand Pacific
    
    // 4. Real-Time Data
    const [arrivalData, setArrivalData] = useState<ServiceArrival[]>([]);
    const [isSimulated, setIsSimulated] = useState(false);
    
    // 5. User Data
    const [savedPlaces, setSavedPlaces] = useLocalStorage<SavedPlace[]>('singatransit_favs', []);
    const [customLocations, setCustomLocations] = useState<Record<string, CustomLocation>>({});

    const workerRef = useRef<Worker | null>(null);

    // --- EFFECT: Load Static Data ---
    useEffect(() => {
        fetch('/data/stops_metadata.json')
            .then(res => res.json())
            .then((data: Metadata) => {
                setMetadata(data);
                setStats(`Ready. Loaded ${Object.keys(data).length} nodes.`);
            })
            .catch(() => setStats("Failed to load metadata."));
    }, []);

    // --- EFFECT: Worker Setup ---
    useEffect(() => {
        const worker = new PathfinderWorker();
        workerRef.current = worker;

        worker.onmessage = (e) => {
            const { type, result } = e.data;
            
            if (type === 'RESULT') {
                if (result.error) {
                    setStats(`Error: ${result.error}`);
                    setProcessedRoutes([]);
                } else if (result.routes && result.routes.length > 0) {
                    if (metadata) {
                        const processed = processRoutes(result.routes as RouteOption[], metadata);
                        setProcessedRoutes(processed);
                        
                        if (processed.length > 0) {
                            setSelectedRouteId(processed[0].id);
                        }
                        setStats(`Found ${processed.length} routes.`);
                    }
                } else {
                    setStats("No routes found with current filters.");
                    setProcessedRoutes([]);
                }
            } else if (type === 'ERROR') {
                setStats(`Worker Error: ${e.data.error}`);
            }
        };

        return () => worker.terminate();
    }, [metadata]);

    // --- SORTING LOGIC ---
    const sortedRoutes = useMemo(() => {
        if (!processedRoutes.length) return [];
        return [...processedRoutes].sort((a, b) => {
            if (activeSort === 'LESS_TRANSFERS') {
                return a.summary.transferCount - b.summary.transferCount;
            } else if (activeSort === 'LESS_WALKING') {
                return a.raw.totalDuration - b.raw.totalDuration; 
            }
            return a.raw.totalDuration - b.raw.totalDuration;
        });
    }, [processedRoutes, activeSort]);


    // --- ACTION: Calculate Route ---
    const handleCalculate = () => {
        if (!workerRef.current || !metadata || !startId || !endId) return;

        setStats("Calculating...");
        setProcessedRoutes([]); 
        setArrivalData([]);
        
        const getEffectiveId = (id: string) => {
            if (id.startsWith('place:')) {
               return findNearestStop(id);
            }
            return id;
        };

        const effStart = getEffectiveId(startId);
        const effEnd = getEffectiveId(endId);

        workerRef.current.postMessage({
            type: 'CALCULATE',
            payload: {
                start: effStart,
                end: effEnd,
                excludedModes: Array.from(excludedModes)
            }
        });
    };

    const findNearestStop = (placeId: string): string => {
        const match = placeId.match(/place:([\d\.]+),([\d\.]+):/);
        if (!match || !metadata) return '01012'; 
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        let nearestId = '';
        let nearestDist = Infinity;
        for (const [id, node] of Object.entries(metadata)) {
            const dx = node.lat - lat;
            const dy = node.lng - lng;
            const dist = dx * dx + dy * dy;
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestId = id;
            }
        }
        return nearestId || '01012';
    };
    
    const saveCurrentPlace = (type: 'start' | 'end') => {
        const idToSave = type === 'start' ? startId : endId;
        const name = metadata?.[idToSave]?.name || idToSave;
        const label = prompt(`Enter a name for this location:`, name);
        if (label) {
            setSavedPlaces([...savedPlaces, { id: Date.now().toString(), stopId: idToSave, label }]);
        }
    };

    // --- EFFECT: Fetch Real-Time Data ---
    useEffect(() => {
        if (!selectedRouteId || processedRoutes.length === 0) return;

        const selectedRoute = processedRoutes.find(r => r.id === selectedRouteId);
        if (!selectedRoute) return;

        const firstLeg = selectedRoute.legs[0];

        if (firstLeg && firstLeg.type === 'BUS') {
            fetchArrivals(firstLeg.startStopId)
                .then(data => {
                    const safeData = data || [];
                    const hasTargetBus = safeData.some(s => s.ServiceNo === firstLeg.service);
                    setArrivalData(safeData);
                    setIsSimulated(!hasTargetBus); 
                })
                .catch(() => {
                    setArrivalData([]);
                    setIsSimulated(true);
                });
        }
    }, [selectedRouteId, processedRoutes]);

    const getSegmentStyle = (segment: RouteSegment, isSelected: boolean) => {
        const baseOpacity = isSelected ? 1 : 0.3;
        const weight = isSelected ? 6 : 4;
        const zIndex = isSelected ? 100 : 1;

        let color = '#7f8c8d'; 
        if (segment.type === 'MRT') color = '#e74c3c'; 
        if (segment.type === 'LRT') color = '#8e44ad';
        if (segment.type === 'BUS') color = '#2980b9';
        
        const dashArray = segment.type === 'WALK' ? '5, 10' : undefined;

        return { color, weight, opacity: baseOpacity, zIndex, dashArray };
    };

    return (
        <div className="app-container">
            <div className="sidebar">
                <div className="sidebar-content">
                    <h2 style={{ marginTop: 0 }}>SingaTransit</h2>
                    
                    <div className="input-group">
                        <LocationSearch 
                            label="FROM" 
                            initialValue={startId} 
                            onSelect={(id) => {
                                setStartId(id);
                                if (id.startsWith('place:')) {
                                     const match = id.match(/place:([\d\.]+),([\d\.]+):(.+)/);
                                     if (match) {
                                         const [, lat, lng, name] = match;
                                         setCustomLocations(prev => ({ ...prev, [id]: { id, name, lat: parseFloat(lat), lng: parseFloat(lng), road: '' } }));
                                     }
                                }
                            }}
                            onSave={() => saveCurrentPlace('start')}
                        />
                        <LocationSearch 
                            label="TO" 
                            initialValue={endId} 
                            onSelect={(id) => {
                                setEndId(id);
                                if (id.startsWith('place:')) {
                                     const match = id.match(/place:([\d\.]+),([\d\.]+):(.+)/);
                                     if (match) {
                                         const [, lat, lng, name] = match;
                                         setCustomLocations(prev => ({ ...prev, [id]: { id, name, lat: parseFloat(lat), lng: parseFloat(lng), road: '' } }));
                                     }
                                }
                            }}
                            onSave={() => saveCurrentPlace('end')}
                        />

                        <RouteOptionsBar 
                            activeSort={activeSort}
                            excludedModes={excludedModes}
                            onSortChange={setActiveSort}
                            onModeToggle={(mode) => {
                                const next = new Set(excludedModes);
                                if (next.has(mode)) next.delete(mode);
                                else next.add(mode);
                                setExcludedModes(next);
                            }}
                        />

                        <button className="action-btn" onClick={handleCalculate} style={{ marginTop: '10px' }}>
                            Find Route
                        </button>
                    </div>

                    <div className="status-bar" style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
                        {stats}
                    </div>

                    <RouteList 
                        routes={sortedRoutes}
                        selectedId={selectedRouteId}
                        onSelect={setSelectedRouteId}
                        arrivalData={arrivalData}
                        isSimulated={isSimulated}
                    />

                    {processedRoutes.length === 0 && savedPlaces.length > 0 && (
                        <div className="favorites-list" style={{ marginTop: '20px' }}>
                            <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '5px', marginTop: 0 }}>Saved Places</h3>
                            {savedPlaces.map(place => (
                                <div key={place.id} className="fav-item" onClick={() => { setStartId(place.stopId); }}>
                                    <div>{place.label}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="map-container">
                <MapContainer center={SINGAPORE_CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                        url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png"
                        attribution='Map data © contributors, <a href="https://www.sla.gov.sg/">Singapore Land Authority</a>'
                    />

                    {sortedRoutes.map(route => {
                        const isSelected = route.id === selectedRouteId;
                        return route.segments.map((seg, idx) => (
                            <Polyline
                                key={`${route.id}-${idx}`}
                                positions={seg.positions}
                                pathOptions={getSegmentStyle(seg, isSelected)}
                                eventHandlers={{
                                    click: () => setSelectedRouteId(route.id)
                                }}
                            />
                        ));
                    })}
                    
                    {/* Transfer Markers */}
                    {sortedRoutes.find(r => r.id === selectedRouteId)?.segments.slice(0, -1).map((seg, i) => {
                        const lastPos = seg.positions[seg.positions.length - 1];
                        return (
                             <CircleMarker 
                                key={`transfer-${i}`} 
                                center={lastPos} 
                                radius={4} 
                                pathOptions={{ color: 'white', fillColor: 'black', fillOpacity: 1, weight: 2 }} 
                            />
                        )
                    })}
                    
                    {/* Custom Location Markers (FIXED: Added this loop back) */}
                    {Object.values(customLocations).map(loc => (
                        <Marker
                            key={loc.id}
                            position={[loc.lat, loc.lng]}
                            icon={L.divIcon({
                                html: `<div style="background-color: #27ae60; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
                                iconSize: [16, 16],
                                className: 'custom-location-marker'
                            })}
                        >
                            <Popup>{loc.name}</Popup>
                        </Marker>
                    ))}

                    {metadata && metadata[startId] && (
                        <Marker position={[metadata[startId].lat, metadata[startId].lng]}>
                            <Popup>Start: {metadata[startId].name}</Popup>
                        </Marker>
                    )}
                    {metadata && metadata[endId] && (
                        <Marker position={[metadata[endId].lat, metadata[endId].lng]}>
                            <Popup>End: {metadata[endId].name}</Popup>
                        </Marker>
                    )}
                </MapContainer>
            </div>
        </div>
    );
};

export default MapComponent;