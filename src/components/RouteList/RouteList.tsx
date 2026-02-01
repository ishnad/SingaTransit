import React from 'react';
import { RouteCard } from './RouteCard';
import type { ProcessedRoute } from '../../types/transport';
import type { ServiceArrival } from '../../services/ltaService';

interface RouteListProps {
  routes: ProcessedRoute[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  arrivalData: ServiceArrival[];
  isSimulated?: boolean;
}

export const RouteList: React.FC<RouteListProps> = ({ 
  routes, 
  selectedId, 
  onSelect, 
  arrivalData, 
  isSimulated 
}) => {
  
  if (!routes || routes.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No routes found.</div>;
  }

  return (
    <div className="route-list-container">
      {routes.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          isSelected={route.id === selectedId}
          isExpanded={route.id === selectedId} // Auto-expand selected, collapse others
          onToggle={() => onSelect(route.id)}
          arrivalData={arrivalData}
          isSimulated={isSimulated}
        />
      ))}
    </div>
  );
};