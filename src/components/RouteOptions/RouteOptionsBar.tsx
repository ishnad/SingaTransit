import React from 'react';
import { SortDropdown } from './SortDropdown';
import { ModeFilterChips } from './ModeFilterChips';
import type { SortOption, TransportMode } from '../../types/transport';

interface Props {
  activeSort: SortOption;
  excludedModes: Set<TransportMode>;
  onSortChange: (sort: SortOption) => void;
  onModeToggle: (mode: TransportMode) => void;
}

export const RouteOptionsBar: React.FC<Props> = ({ activeSort, excludedModes, onSortChange, onModeToggle }) => {
  return (
    <div className="route-options-bar" style={{ marginBottom: '15px' }}>
      <div className="sort-section" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
        <span className="label" style={{ marginRight: '10px', fontSize: '12px', color: '#aaa' }}>Sort by:</span>
        <SortDropdown activeSort={activeSort} onSelect={onSortChange} />
      </div>
      <div className="filter-section">
        <ModeFilterChips excludedModes={excludedModes} onToggleMode={onModeToggle} />
      </div>
    </div>
  );
};