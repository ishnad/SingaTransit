import React from 'react';
import { SORT_OPTIONS } from '../../types/transport';
import type { SortOption } from '../../types/transport';

interface Props {
  activeSort: SortOption;
  onSelect: (option: SortOption) => void;
}

export const SortDropdown: React.FC<Props> = ({ activeSort, onSelect }) => {
  return (
    <select 
      role="combobox"
      value={activeSort} 
      onChange={(e) => onSelect(e.target.value as SortOption)}
      className="sort-dropdown"
      aria-label="Sort routes"
    >
      {SORT_OPTIONS.map(opt => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};