import { render, screen, fireEvent } from '@testing-library/react';
import { ModeFilterChips } from '../ModeFilterChips';
import { vi } from 'vitest';

test('toggles mode exclusion on click', () => {
  const mockToggle = vi.fn();
  const excluded = new Set<any>([]); // Nothing excluded initially
  
  render(<ModeFilterChips excludedModes={excluded} onToggleMode={mockToggle} />);
  
  const busChip = screen.getByText('Bus');
  fireEvent.click(busChip);
  
  expect(mockToggle).toHaveBeenCalledWith('BUS');
});