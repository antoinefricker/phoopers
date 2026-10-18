import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import type { PlayId } from '../engine';
import type { PlaySummary } from '../types/PlaySummary';
import { PlayCard } from './PlayCard';

const horns: PlaySummary = {
  id: 'p1' as PlayId,
  name: 'Horns flare',
  court: 'fiba',
  extent: 'half',
  isPublic: true,
  updatedAt: '2026-03-04T12:00:00Z',
  ownerId: 'u1',
};

describe('PlayCard', () => {
  it('draws the visibility badge only when asked to', () => {
    const { rerender } = render(
      <MantineProvider env="test">
        <PlayCard summary={horns} onOpen={() => {}} />
      </MantineProvider>,
    );
    expect(screen.queryByText('Public')).not.toBeInTheDocument();
    rerender(
      <MantineProvider env="test">
        <PlayCard summary={horns} onOpen={() => {}} showVisibility />
      </MantineProvider>,
    );
    expect(screen.getByText('Public')).toBeInTheDocument();
  });
});
