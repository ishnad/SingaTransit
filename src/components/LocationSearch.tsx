import React, { useState, useEffect, useRef } from 'react';
import { searchOneMap, type OneMapResult } from '../services/ltaService';

interface Station {
    id: string;
    name: string;
    road: string;
    type: 'BUS' | 'MRT' | 'LRT' | 'PLACE';
    lat?: number;
    lng?: number;
}

interface Metadata {
    [key: string]: {
        name: string;
        road: string;
        type?: 'BUS' | 'MRT' | 'LRT';
    };
}

interface LocationSearchProps {
    label: string;
    initialValue?: string;
    onSelect: (id: string) => void;
    onSave?: () => void; // Optional "Save" button handler
}

export const LocationSearch: React.FC<LocationSearchProps> = ({ label, initialValue, onSelect, onSave }) => {
    const [query, setQuery] = useState('');
    const [stations, setStations] = useState<Station[]>([]);
    const [suggestions, setSuggestions] = useState<Station[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Load Data Once
    useEffect(() => {
        fetch('/data/stops_metadata.json')
            .then(res => res.json())
            .then((data: Metadata) => {
                const list = Object.entries(data).map(([id, info]) => ({
                    id,
                    name: info.name,
                    road: info.road,
                    type: info.type || 'BUS'
                }));
                setStations(list);
                
                // Set initial text if ID is provided
                if (initialValue && data[initialValue]) {
                    setQuery(data[initialValue].name);
                }
            })
            .catch(err => console.error("Failed to load metadata", err));
    }, []);

    // Update query if initialValue changes externally (e.g. loading a favorite)
    useEffect(() => {
        if (initialValue && stations.length > 0) {
            const match = stations.find(s => s.id === initialValue);
            if (match) setQuery(match.name);
        }
    }, [initialValue, stations]);

    // Handle Outside Click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Filter Logic + OneMap Search
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (query.length < 2) {
                setSuggestions([]);
                return;
            }

            const lowerQuery = query.toLowerCase();
            
            // 1. Filter local stations
            const localMatches = stations
                .filter(s =>
                    s.name.toLowerCase().includes(lowerQuery) ||
                    s.id.toLowerCase().includes(lowerQuery) ||
                    s.road.toLowerCase().includes(lowerQuery)
                );

            // 2. Fetch from OneMap if query looks like a place/postal code
            // (Only if we don't have too many local matches, or always?)
            let placeMatches: Station[] = [];
            try {
                const oneMapResults = await searchOneMap(query);
                placeMatches = oneMapResults.map(res => ({
                    id: `place:${res.LATITUDE},${res.LONGITUDE}:${res.SEARCHVAL}`,
                    name: res.SEARCHVAL,
                    road: res.ADDRESS,
                    type: 'PLACE',
                    lat: parseFloat(res.LATITUDE),
                    lng: parseFloat(res.LONGITUDE)
                }));
            } catch (err) {
                console.error("OneMap search failed", err);
            }

            const combined = [...localMatches, ...placeMatches].slice(0, 50);
            setSuggestions(combined);
        };

        const timer = setTimeout(fetchSuggestions, 300); // Debounce
        return () => clearTimeout(timer);
    }, [query, stations]);

    const handleSelect = (station: Station) => {
        setQuery(station.name);
        onSelect(station.id);
        setShowDropdown(false);
    };

    const getBadgeColor = (type: string) => {
        switch(type) {
            case 'MRT': return '#e74c3c'; // Red
            case 'LRT': return '#8e44ad'; // Purple
            case 'PLACE': return '#27ae60'; // Green
            default: return '#3498db';    // Blue
        }
    };

    return (
        <div ref={wrapperRef} style={{ marginBottom: '10px', position: 'relative', width: '100%' }}>
            <label style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '4px' }}>
                {label}
            </label>
            <div style={{ display: 'flex' }}>
                <input
                    className="dark-input"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search places, postal codes, stops..."
                    style={{ flex: 1 }}
                />
                {onSave && (
                    <button 
                        onClick={onSave} 
                        style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '0 8px' }}
                        title="Save to Favorites"
                    >
                        ★
                    </button>
                )}
            </div>

            {showDropdown && suggestions.length > 0 && (
                <ul className="suggestions-list">
                    {suggestions.map(s => (
                        <li key={s.id} onClick={() => handleSelect(s)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{s.name}</span>
                                <span style={{ 
                                    fontSize: '9px', 
                                    background: getBadgeColor(s.type), 
                                    padding: '2px 4px', 
                                    borderRadius: '3px', 
                                    color: 'white' 
                                }}>
                                    {s.type}
                                </span>
                            </div>
                            <div style={{ fontSize: '10px', color: '#888' }}>{s.road}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};