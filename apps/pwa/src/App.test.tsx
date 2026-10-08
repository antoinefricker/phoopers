import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the application heading', () => {
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Phoopers' })).toBeInTheDocument();
    expect(screen.getByText('Design and replay basketball plays')).toBeInTheDocument();
  });
});
