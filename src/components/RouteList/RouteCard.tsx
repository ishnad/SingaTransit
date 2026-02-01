import React from 'react';
import type { ProcessedRoute, TripLeg } from '../../types/transport';
import type { ServiceArrival } from '../../services/ltaService';
import { getMinutesToArrival } from '../../services/ltaService';

interface RouteCardProps {
  route: ProcessedRoute;
  isSelected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  arrivalData: ServiceArrival[];
  isSimulated?: boolean;
}

export const RouteCard: React.FC<RouteCardProps> = ({ 
  route, 
  isSelected, 
  isExpanded, 
  onToggle, 
  arrivalData, 
  isSimulated 
}) => {
  
  // Helper to render the badges in the header
  const renderModeBadges = () => {
    return route.summary.modes.map((mode, idx) => (
       <span key={idx} className={`mini-badge mode-${mode.toLowerCase()}`}>
         {mode}
       </span>
    ));
  };

  return (
    <div 
      className={`route-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
      onClick={onToggle}
    >
      {/* HEADER */}
      <div className="route-card-header">
        <div className="header-top">
          <div className="duration-info">
            <span className="duration-mins">{route.summary.duration} min</span>
            <span className="arrival-time">{route.summary.arrivalTime}</span>
          </div>
          <div className="mode-icons">
             {renderModeBadges()}
          </div>
        </div>
        
        <div className="header-sub">
            <span className="route-label">{route.raw.label || 'Recommended'}</span>
            <span className="transfers">
                {route.summary.transferCount === 0 ? 'Direct' : `${route.summary.transferCount} Transfers`}
            </span>
        </div>
      </div>

      {/* BODY (Accordion) */}
      <div className={`route-card-body ${isExpanded ? 'open' : ''}`}>
        <div className="body-content">
            {route.legs.map((leg, idx) => (
                <LegItem 
                    key={idx} 
                    leg={leg} 
                    isFirst={idx === 0}
                    arrivalData={arrivalData} 
                    isSimulated={isSimulated} 
                />
            ))}
        </div>
      </div>
    </div>
  );
};

// Sub-component for individual steps
const LegItem: React.FC<{ leg: TripLeg; isFirst: boolean; arrivalData: ServiceArrival[]; isSimulated?: boolean }> = ({ 
    leg, isFirst, arrivalData, isSimulated 
}) => {
    let nextBusMins: number | null = null;
    let color = '#7f8c8d'; // default grey for WALK

    // Determine Color
    if (leg.type === 'MRT') color = '#e74c3c'; // Red (Generic MRT) - In real app, match line color
    if (leg.type === 'LRT') color = '#8e44ad';
    if (leg.type === 'BUS') color = '#2980b9';

    // Get Live Data for First Leg
    if (leg.type === 'BUS' && isFirst) {
        const liveInfo = arrivalData.find(s => s.ServiceNo === leg.service);
        if (liveInfo?.NextBus?.EstimatedArrival) {
            nextBusMins = getMinutesToArrival(liveInfo.NextBus.EstimatedArrival);
        }
    }

    return (
        <div className="leg-item" style={{ borderLeftColor: color }}>
            <div className="leg-header">
                <span className="leg-service" style={{ color: color }}>
                    {leg.type === 'WALK' ? 'Walk' : leg.service}
                </span>
                
                {leg.type === 'BUS' && isFirst && (
                    <span className={`live-badge ${isSimulated ? 'sim' : ''} ${nextBusMins !== null ? 'live' : ''}`}>
                        {isSimulated ? 'Sim' : (nextBusMins !== null ? `${nextBusMins} min` : 'No Data')}
                    </span>
                )}
            </div>
            
            <div className="leg-desc">
                {leg.type === 'WALK' 
                    ? `Walk to ${leg.endStopName}`
                    : `Board at ${leg.startStopName}`
                }
            </div>
            
            {leg.type !== 'WALK' && (
                <div className="leg-sub">
                    Alight at {leg.endStopName} ({leg.stopCount} stops)
                </div>
            )}
        </div>
    );
};