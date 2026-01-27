import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import PathfinderWorker from '../workers/pathfinder.worker?worker';

import { formatRoute, type TripLeg } from '../utils/routeFormatter';
import { fetchArrivals, getMinutesToArrival, type ServiceArrival } from '../services/ltaService';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { LocationSearch } from './LocationSearch';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Leaflet Icon
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const SINGAPORE_CENTER: [number, number] = [1.3521, 103.8198];

interface Metadata {
    [key: string]: {
        lat: number;
        lng: number;
        name: string;
        road: string;
        type?: 'BUS' | 'MRT' | 'LRT';
    }
}

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

// New Interface for Map Segments
interface RouteSegment {
    type: 'BUS' | 'MRT' | 'LRT' | 'WALK';
    service: string;
    positions: [number, number][];
}

const MapComponent: React.FC = () => {
    // 1. Core State
    const [metadata, setMetadata] = useState<Metadata | null>(null);
    const [stats, setStats] = useState<string>('Initializing...');
    
    // 2. Route & Instructions
    // REPLACED: routePath with routeSegments
    const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
    const [instructions, setInstructions] = useState<TripLeg[]>([]);
    
    // 3. Real-Time Data
    const [arrivalData, setArrivalData] = useState<ServiceArrival[]>([]);
    const [isSimulated, setIsSimulated] = useState(false);

    // 4. Inputs & Persistence
    const [startId, setStartId] = useState('84009');
    const [endId, setEndId] = useState('01012');
    const [savedPlaces, setSavedPlaces] = useLocalStorage<SavedPlace[]>('singatransit_favs', []);
    const [customLocations, setCustomLocations] = useState<Record<string, CustomLocation>>({});

    const workerRef = useRef<Worker | null>(null);

    // --- EFFECT: Load Static Data ---
    useEffect(() => {
        fetch('/data/stops_metadata.json')
            .then(res => res.json())
            .then((data) => {
                setMetadata(data);
                setStats(`Ready. Loaded ${Object.keys(data).length} nodes.`);
            })
            .catch(() => setStats('Failed to load metadata.'));
    }, []);

    // --- EFFECT: Worker Setup ---
    useEffect(() => {
        const worker = new PathfinderWorker();
        workerRef.current = worker;
        worker.onmessage = (e) => {
            const { type, result, error } = e.data;
            if (type === 'RESULT') {
                if (result.error) {
                    setStats(`Error: ${result.error}`);
                } else {
                    handleRouteSuccess(result.path, result.totalDuration);
                }
            } else if (type === 'ERROR') {
                setStats(`Worker Error: ${error}`);
            }
        };
        return () => worker.terminate();
    }, [metadata]); 

    // --- HELPERS: Color Mapping ---
    const getServiceType = (service: string): 'BUS' | 'MRT' | 'LRT' | 'WALK' => {
        if (service === 'WALK') return 'WALK';
        const mrtLines = ['NSL', 'EWL', 'NEL', 'CCL', 'DTL', 'TEL'];
        if (mrtLines.some(line => service.startsWith(line))) return 'MRT';
        const lrtLines = ['BPLrt', 'SKLrt', 'PGLrt', 'LRT']; 
        if (lrtLines.some(line => service.includes(line)) || service.endsWith('LRT')) return 'LRT';
        return 'BUS';
    };

    const getLineColor = (service: string, type: string) => {
        if (type === 'WALK') return '#7f8c8d'; // Grey
        if (type === 'BUS') return '#2980b9';  // Blue

        // MRT Official Colors
        if (service.startsWith('NSL')) return '#d63031'; // Red (North South)
        if (service.startsWith('EWL')) return '#009432'; // Green (East West)
        if (service.startsWith('NEL')) return '#8e44ad'; // Purple (North East)
        if (service.startsWith('CCL')) return '#fa8231'; // Orange (Circle)
        if (service.startsWith('DTL')) return '#0984e3'; // Blue (Downtown)
        if (service.startsWith('TEL')) return '#634206'; // Brown (Thomson)
        
        // LRT
        if (type === 'LRT') return '#57606f'; // Dark Grey for LRT

        return '#2980b9'; // Fallback Blue
    };

    // --- HANDLERS ---

    const handleRouteSuccess = (path: any[], duration: number) => {
        if (!metadata || path.length === 0) return;
        setStats(`Route Found! ~${Math.round(duration / 60)} mins.`);

        // --- NEW: BUILD POLYLINE SEGMENTS ---
        const segments: RouteSegment[] = [];
        let currentPoints: [number, number][] = [];
        
        // Initialize with first point
        const startNode = metadata[path[0].from];
        if (startNode) currentPoints.push([startNode.lat, startNode.lng]);

        let currentService = path[0].service;
        let currentType = getServiceType(currentService);

        for (let i = 0; i < path.length; i++) {
            const step = path[i];
            const nextNode = metadata[step.to];
            
            if (!nextNode) continue;

            const nextPoint: [number, number] = [nextNode.lat, nextNode.lng];
            
            // Check if service changed
            if (step.service !== currentService) {
                // 1. Push completed segment
                if (currentPoints.length > 0) {
                    segments.push({
                        type: currentType,
                        service: currentService,
                        positions: currentPoints
                    });
                }

                // 2. Start new segment
                // Important: The new segment must start where the last one ended (visual continuity)
                const lastPoint = currentPoints[currentPoints.length - 1];
                currentPoints = [lastPoint, nextPoint]; // Start new line from previous point to current target
                
                currentService = step.service;
                currentType = getServiceType(step.service);
            } else {
                // Continue same segment
                currentPoints.push(nextPoint);
            }
        }

        // Push final segment
        if (currentPoints.length > 0) {
            segments.push({
                type: currentType,
                service: currentService,
                positions: currentPoints
            });
        }

        setRouteSegments(segments);

        // --- Format Instructions & Fetch Real-time ---
        const legs = formatRoute(path, metadata);
        setInstructions(legs);
        
        if (legs.length > 0 && legs[0].type === 'BUS') {
            const firstLeg = legs[0];
            fetchArrivals(firstLeg.startStopId).then(data => {
                const safeData = data || [];
                const hasTargetBus = safeData.some(s => s.ServiceNo === firstLeg.service);
                if (!hasTargetBus) {
                     setArrivalData(generateMockArrivals(firstLeg.service));
                     setIsSimulated(true);
                } else {
                    setArrivalData(safeData);
                    setIsSimulated(false);
                }
            }).catch(() => {
                setArrivalData(generateMockArrivals(firstLeg.service));
                setIsSimulated(true);
            });
        } else {
            setArrivalData([]);
        }
    };

    const generateMockArrivals = (targetService: string): ServiceArrival[] => {
        return [{
            ServiceNo: targetService,
            Operator: "SIM",
            NextBus: { EstimatedArrival: new Date(Date.now() + 300000).toISOString(), Load: "SEA", Feature: "WAB", Type: "DD", OriginCode: "0", DestinationCode: "0", Latitude: "0", Longitude: "0", VisitNumber: "1" },
            NextBus2: { EstimatedArrival: "", Load: "", Feature: "", Type: "", OriginCode: "", DestinationCode: "", Latitude: "", Longitude: "", VisitNumber: "" },
            NextBus3: { EstimatedArrival: "", Load: "", Feature: "", Type: "", OriginCode: "", DestinationCode: "", Latitude: "", Longitude: "", VisitNumber: "" }
        }];
    };

    const handleCalculate = () => {
        if (!workerRef.current) return;
        setStats('Calculating...');
        setRouteSegments([]); // Clear map
        setInstructions([]);
        setArrivalData([]);
        setIsSimulated(false);
        
        // Determine if start/end are custom place IDs
        const startNode = startId.startsWith('place:') ? findNearestStop(startId) : startId;
        const endNode = endId.startsWith('place:') ? findNearestStop(endId) : endId;
        
        workerRef.current.postMessage({ type: 'CALCULATE', payload: { start: startNode, end: endNode } });
    };

    const findNearestStop = (placeId: string): string => {
        // Extract lat/lng from placeId
        const match = placeId.match(/place:([\d\.]+),([\d\.]+):/);
        if (!match || !metadata) return '01012'; // fallback
        
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        
        let nearestId = '';
        let nearestDist = Infinity;
        
        for (const [id, node] of Object.entries(metadata)) {
            const dx = node.lat - lat;
            const dy = node.lng - lng;
            const dist = dx * dx + dy * dy; // squared distance
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
        const label = prompt(`Enter a name for this location (e.g. Home, Work):`, name);
        
        if (label) {
            const newPlace: SavedPlace = {
                id: Date.now().toString(),
                stopId: idToSave,
                label: label
            };
            setSavedPlaces([...savedPlaces, newPlace]);
        }
    };

    const deletePlace = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSavedPlaces(savedPlaces.filter(p => p.id !== id));
    };

    const loadPlace = (place: SavedPlace) => {
        if (startId === '') setStartId(place.stopId);
        else setEndId(place.stopId);
    };

    // --- RENDER HELPERS ---
    
    // Calculate start/end markers from segments
    const startPos = routeSegments.length > 0 ? routeSegments[0].positions[0] : null;
    const endPos = routeSegments.length > 0 
        ? routeSegments[routeSegments.length - 1].positions[routeSegments[routeSegments.length - 1].positions.length - 1] 
        : null;

    return (
        <div className="app-container">
            {/* Sidebar */}
            <div className="sidebar">
                <div className="sidebar-content">
                    <h2 style={{ marginTop: 0 }}>SingaTransit</h2>
                    
                    <div className="input-group">
                        <LocationSearch
                            label="FROM"
                            initialValue={startId}
                            onSelect={(id) => {
                                setStartId(id);
                                // If it's a custom place, store its coordinates
                                if (id.startsWith('place:')) {
                                    const match = id.match(/place:([\d\.]+),([\d\.]+):(.+)/);
                                    if (match) {
                                        const [, lat, lng, name] = match;
                                        setCustomLocations(prev => ({
                                            ...prev,
                                            [id]: {
                                                id,
                                                name,
                                                lat: parseFloat(lat),
                                                lng: parseFloat(lng),
                                                road: ''
                                            }
                                        }));
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
                                        setCustomLocations(prev => ({
                                            ...prev,
                                            [id]: {
                                                id,
                                                name,
                                                lat: parseFloat(lat),
                                                lng: parseFloat(lng),
                                                road: ''
                                            }
                                        }));
                                    }
                                }
                            }}
                            onSave={() => saveCurrentPlace('end')}
                        />
                        
                        <button className="action-btn" onClick={handleCalculate}>
                            Find Route
                        </button>
                        
                        <div style={{ marginTop: '10px', fontSize: '12px', color: stats.includes('Error') ? 'red' : '#00ff00', fontWeight: 'bold' }}>
                            {stats}
                        </div>
                    </div>

                    {/* SAVED PLACES */}
                    {instructions.length === 0 && (
                        <div className="favorites-list">
                            <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '5px', marginTop: 0 }}>Saved Places</h3>
                            {savedPlaces.length === 0 && <p style={{color: '#666', fontSize: '12px'}}>No saved places. Tap ★ to save.</p>}
                            
                            {savedPlaces.map(place => (
                                <div key={place.id} className="fav-item" onClick={() => loadPlace(place)}>
                                    <div>
                                        <div style={{fontWeight: 'bold', fontSize: '14px'}}>{place.label}</div>
                                        <div style={{color: '#888', fontSize: '11px'}}>{place.stopId}</div>
                                    </div>
                                    <button 
                                        onClick={(e) => deletePlace(place.id, e)}
                                        style={{background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '16px'}}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ITINERARY */}
                    {instructions.length > 0 && (
                        <div className="itinerary-list">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h3 style={{ margin: 0 }}>Itinerary</h3>
                                <button onClick={() => { setInstructions([]); setRouteSegments([]); }} style={{background: 'none', border: 'none', color: '#aaa', fontSize: '12px', cursor: 'pointer'}}>Close X</button>
                            </div>
                            
                            {instructions.map((leg, idx) => {
                                let nextBusMins: number | null = null;
                                if (leg.type === 'BUS') {
                                    const liveInfo = arrivalData.find(s => s.ServiceNo === leg.service);
                                    if (liveInfo?.NextBus?.EstimatedArrival) {
                                        nextBusMins = getMinutesToArrival(liveInfo.NextBus.EstimatedArrival);
                                    }
                                }

                                // CSS color for the text based on mode
                                const color = getLineColor(leg.service, leg.type);
                                
                                return (
                                    <div key={idx} style={{ marginBottom: '15px', paddingLeft: '10px', borderLeft: `4px solid ${color}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: color }}>
                                                {leg.type === 'WALK' ? 'Walk' : `${leg.type} ${leg.service}`}
                                            </div>
                                            
                                            {leg.type === 'BUS' && (
                                                <div style={{ 
                                                    fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                                                    backgroundColor: isSimulated ? '#d35400' : (nextBusMins !== null ? '#27ae60' : '#7f8c8d'), 
                                                    color: 'white'
                                                }}>
                                                    {nextBusMins !== null ? `${nextBusMins} min` : 'No Data'}{isSimulated && ' (Sim)'}
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div style={{ fontSize: '12px', color: '#ddd' }}>Board: {leg.startStopName}</div>
                                        {leg.type === 'WALK' ? (
                                             <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', margin: '4px 0' }}>
                                                ~{Math.ceil(leg.duration / 60)} mins
                                             </div>
                                        ) : (
                                            <div style={{ fontSize: '11px', color: '#888', margin: '4px 0' }}>
                                                ↓ {leg.stopCount} stops (~{Math.ceil(leg.duration / 60)} mins)
                                            </div>
                                        )}
                                        <div style={{ fontSize: '12px', color: '#ddd' }}>Alight: {leg.endStopName}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Map Area */}
            <div className="map-container">
                <MapContainer 
                    center={SINGAPORE_CENTER} 
                    zoom={12} 
                    scrollWheelZoom={true}
                    zoomControl={false}
                    style={{ height: "100%", width: "100%" }}
                >
                    <TileLayer attribution='&copy; OneMap' url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png" />
                    
                    {/* Render Segments */}
                    {routeSegments.map((segment, index) => (
                        <Polyline 
                            key={index}
                            positions={segment.positions}
                            pathOptions={{
                                color: getLineColor(segment.service, segment.type),
                                weight: 6,
                                opacity: 0.9,
                                dashArray: segment.type === 'WALK' ? '5, 10' : undefined // Dotted line for walking
                            }}
                        />
                    ))}

                    {/* Start/End Markers */}
                    {startPos && <Marker position={startPos}><Popup>Start</Popup></Marker>}
                    {endPos && <Marker position={endPos}><Popup>End</Popup></Marker>}
                    
                    {/* Custom Location Markers */}
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
                    
                    {/* Optional: Add small circles at transfer points */}
                    {routeSegments.length > 1 && routeSegments.slice(0, -1).map((seg, i) => {
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
                </MapContainer>
            </div>
        </div>
    );
};

export default MapComponent;