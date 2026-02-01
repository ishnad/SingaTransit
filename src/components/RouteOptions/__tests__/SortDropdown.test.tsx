import { render, screen, fireEvent } from '@testing-library/react';
import { SortDropdown } from '../SortDropdown';
import { vi } from 'vitest';

test('calls onSelect when an option is selected', () => {
  const mockSelect = vi.fn();
  render(<SortDropdown activeSort="FASTEST" onSelect={mockSelect} />);
  
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'LESS_TRANSFERS' } });
  
  expect(mockSelect).toHaveBeenCalledWith('LESS_TRANSFERS');
});