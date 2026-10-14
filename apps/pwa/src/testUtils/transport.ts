import { screen } from '@testing-library/react';

/**
 * Where the playhead is, read off the scrubber.
 *
 * The transport used to print the time beside the scrubber and tests read that. The readout is
 * gone, but the thumb carries the same value — both are fed by `displayTime` — and it is what a
 * screen reader is told, so it is the better thing to assert against anyway.
 */
export function playheadTime(): number {
  const value = screen.getByRole('slider').getAttribute('aria-valuenow');
  if (value === null) throw new Error('the scrubber has no aria-valuenow');

  return Number(value);
}
