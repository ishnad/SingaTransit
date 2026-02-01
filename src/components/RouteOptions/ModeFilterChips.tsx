import React from 'react';
import { TRANSPORT_MODES } from '../../types/transport';
import type { TransportMode } from '../../types/transport';

interface Props {
  excludedModes: Set<TransportMode>;
  onToggleMode: (mode: TransportMode) => void;
}

export const ModeFilterChips: React.FC<Props> = ({ excludedModes, onToggleMode }) => {
  return (
    <div className="mode-filter-chips">
      {TRANSPORT_MODES.map(mode => {
        // A mode is active if it is NOT in the excluded set
        const isActive = !excludedModes.has(mode.id);
        return (
          <button
            key={mode.id}
            onClick={() => onToggleMode(mode.id)}
            className={`chip ${isActive ? 'active' : 'inactive'}`}
            aria-pressed={isActive}
            aria-label={`Toggle ${mode.label}`}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
};