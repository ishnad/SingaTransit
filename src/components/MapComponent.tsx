import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';
import PathfinderWorker from '../workers/pathfinder.worker?worker';

import { formatRoute, type TripLeg } from '../utils/routeFormatter';
import { fetchArrivals, getMinutesToArrival, type ServiceArrival } from '../services/ltaService';
import { useLocalStorage } from '../hooks/useLocalStorage';

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

interface Metadata {
    [key: string]: {
        lat: number;
        lng: number;
        name: string;
        road: string;
    }
}

interface SavedPlace {
    id: string;
    stopId: string;
    label: string; // "Home", "Work", "Bedok Mall"
}

const MapComponent: React.FC = () => {
    // 1. Core State
    const [metadata, setMetadata] = useState<Metadata | null>(null);
    const [stats, setStats] = useState<string>('Initializing...');
    
    // 2. Route & Instructions
    const [routePath, setRoutePath] = useState<[number, number][]>([]);
    const [instructions, setInstructions] = useState<TripLeg[]>([]);
    
    // 3. Real-Time Data
    const [arrivalData, setArrivalData] = useState<ServiceArrival[]>([]);
    const [isSimulated, setIsSimulated] = useState(false);

    // 4. Inputs & Persistence
    const [startId, setStartId] = useState('84009'); // Default: Bedok
    const [endId, setEndId] = useState('01012');   // Default: Victoria St
    const [savedPlaces, setSavedPlaces] = useLocalStorage<SavedPlace[]>('singatransit_favs', []);

    const workerRef = useRef<Worker | null>(null);

    // --- EFFECT: Load Static Data ---
    useEffect(() => {
        const loadData = async () => {
            try {
                const response = await axios.get('/data/stops_metadata.json');
                setMetadata(response.data);
                setStats(`Ready. Loaded ${Object.keys(response.data).length} stops.`);
            } catch (error) {
                setStats('Failed to load metadata.');
            }
        };
        loadData();
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

    // --- HANDLERS ---

    const handleRouteSuccess = (path: any[], duration: number) => {
        if (!metadata) return;
        setStats(`Route Found! ~${Math.round(duration / 60)} mins.`);

        // Draw Path
        const coords: [number, number][] = [];
        if (path.length > 0) {
            const firstNode = metadata[path[0].from];
            if (firstNode) coords.push([firstNode.lat, firstNode.lng]);
        }
        path.forEach(step => {
            const node = metadata[step.to];
            if (node) coords.push([node.lat, node.lng]);
        });
        setRoutePath(coords);

        // Format
        const legs = formatRoute(path, metadata);
        setInstructions(legs);
        
        // Fetch Real-time
        if (legs.length > 0) {
            const firstLeg = legs[0];
            const targetService = firstLeg.service;
            
            fetchArrivals(firstLeg.startStopId).then(data => {
                const safeData = data || [];
                const hasTargetBus = safeData.some(s => s.ServiceNo === targetService);

                if (safeData.length === 0 || !hasTargetBus) {
                    setArrivalData(generateMockArrivals(targetService));
                    setIsSimulated(true);
                } else {
                    setArrivalData(safeData);
                    setIsSimulated(false);
                }
            }).catch(() => {
                setArrivalData(generateMockArrivals(targetService));
                setIsSimulated(true);
            });
        }
    };

    const generateMockArrivals = (targetService: string): ServiceArrival[] => {
        return [{
            ServiceNo: targetService,
            Operator: "SIM",
            NextBus: { EstimatedArrival: new Date(Date.now() + 120000).toISOString(), Load: "SEA", Feature: "WAB", Type: "DD", OriginCode: "0", DestinationCode: "0", Latitude: "0", Longitude: "0", VisitNumber: "1" },
            NextBus2: { EstimatedArrival: "", Load: "", Feature: "", Type: "", OriginCode: "", DestinationCode: "", Latitude: "", Longitude: "", VisitNumber: "" },
            NextBus3: { EstimatedArrival: "", Load: "", Feature: "", Type: "", OriginCode: "", DestinationCode: "", Latitude: "", Longitude: "", VisitNumber: "" }
        }];
    };

    const handleCalculate = () => {
        if (!workerRef.current) return;
        setStats('Calculating...');
        setRoutePath([]);
        setInstructions([]); 
        setArrivalData([]); 
        setIsSimulated(false);
        workerRef.current.postMessage({ type: 'CALCULATE', payload: { start: startId, end: endId } });
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
        // Simple logic: If Start is empty, fill start. Else fill end.
        if (startId === '') setStartId(place.stopId);
        else setEndId(place.stopId);
    };

    // --- RENDER ---

    const getBadgeColor = (isSim: boolean, mins: number | null) => {
        if (isSim) return '#d35400'; 
        if (mins !== null) return '#27ae60'; 
        return '#7f8c8d'; 
    };

    return (
        <div className="app-container">
            {/* Responsive Sidebar */}
            <div className="sidebar">
                <div className="sidebar-content">
                    <h2 style={{ marginTop: 0 }}>SingaTransit</h2>
                    
                    <div className="input-group">
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '4px'}}>FROM</label>
                                <div style={{ display: 'flex' }}>
                                    <input className="dark-input" value={startId} onChange={(e) => setStartId(e.target.value)} />
                                    <button onClick={() => saveCurrentPlace('start')} style={{background: 'none', border:'none', color:'#aaa', cursor:'pointer'}}>★</button>
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '4px'}}>TO</label>
                                <div style={{ display: 'flex' }}>
                                    <input className="dark-input" value={endId} onChange={(e) => setEndId(e.target.value)} />
                                    <button onClick={() => saveCurrentPlace('end')} style={{background: 'none', border:'none', color:'#aaa', cursor:'pointer'}}>★</button>
                                </div>
                            </div>
                        </div>
                        
                        <button className="action-btn" onClick={handleCalculate}>
                            Find Route
                        </button>
                        
                        <div style={{ marginTop: '10px', fontSize: '12px', color: stats.includes('Error') ? 'red' : '#00ff00', fontWeight: 'bold' }}>
                            {stats}
                        </div>
                    </div>

                    {/* DASHBOARD: SAVED PLACES (Show when no route active) */}
                    {instructions.length === 0 && (
                        <div className="favorites-list">
                            <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '5px', marginTop: 0 }}>Saved Places</h3>
                            {savedPlaces.length === 0 && <p style={{color: '#666', fontSize: '12px'}}>No saved places. Tap ★ to save.</p>}
                            
                            {savedPlaces.map(place => (
                                <div key={place.id} className="fav-item" onClick={() => loadPlace(place)}>
                                    <div>
                                        <div style={{fontWeight: 'bold', fontSize: '14px'}}>{place.label}</div>
                                        <div style={{color: '#888', fontSize: '11px'}}>Stop {place.stopId}</div>
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

                    {/* ACTIVE ROUTE INSTRUCTIONS */}
                    {instructions.length > 0 && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h3 style={{ margin: 0 }}>Itinerary</h3>
                                <button onClick={() => { setInstructions([]); setRoutePath([]); }} style={{background: 'none', border: 'none', color: '#aaa', fontSize: '12px', cursor: 'pointer'}}>Close X</button>
                            </div>
                            
                            {instructions.map((leg, idx) => {
                                const liveInfo = arrivalData.find(s => s.ServiceNo === leg.service);
                                let nextBusMins: number | null = null;
                                if (liveInfo && liveInfo.NextBus && liveInfo.NextBus.EstimatedArrival) {
                                    nextBusMins = getMinutesToArrival(liveInfo.NextBus.EstimatedArrival);
                                }

                                return (
                                    <div key={idx} style={{ marginBottom: '15px', paddingLeft: '10px', borderLeft: '3px solid #2196F3' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2196F3' }}>Bus {leg.service}</div>
                                            {idx === 0 && (
                                                <div style={{ 
                                                    fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                                                    backgroundColor: getBadgeColor(isSimulated, nextBusMins), color: 'white'
                                                }}>
                                                    {nextBusMins !== null ? `${nextBusMins} min` : 'No Data'}{isSimulated && ' (Sim)'}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#ddd' }}>Board: {leg.startStopName}</div>
                                        <div style={{ fontSize: '12px', color: '#888', margin: '4px 0' }}>↓ {leg.stopCount} stops</div>
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
                    {routePath.length > 0 && (
                        <>
                            <Polyline positions={routePath} color="#2196F3" weight={6} opacity={0.8} />
                            <Marker position={routePath[0]}><Popup>Start</Popup></Marker>
                            <Marker position={routePath[routePath.length - 1]}><Popup>End</Popup></Marker>
                        </>
                    )}
                </MapContainer>
            </div>
        </div>
    );
};

export default MapComponent;