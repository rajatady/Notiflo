import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import EngineStatus from './EngineStatus';
import { EngineStatusResponse } from '../../lib/types';

describe('EngineStatus', () => {
  it('renders loading state', () => {
    render(<EngineStatus data={null} loading={true} error={null} />);
    expect(screen.getByTestId('engine-status-loading')).toHaveTextContent('Loading...');
  });

  it('renders error state', () => {
    render(<EngineStatus data={null} loading={false} error="Engine unreachable" />);
    expect(screen.getByTestId('engine-status-error')).toHaveTextContent('Engine unreachable');
  });

  it('shows green indicator when available=true', () => {
    const data: EngineStatusResponse = { available: true, conditionsLoaded: 50 };
    render(<EngineStatus data={data} loading={false} error={null} />);
    const indicator = screen.getByTestId('engine-available');
    expect(indicator.className).toContain('bg-neon-green');
  });

  it('shows red indicator when available=false', () => {
    const data: EngineStatusResponse = { available: false };
    render(<EngineStatus data={data} loading={false} error={null} />);
    const indicator = screen.getByTestId('engine-available');
    expect(indicator.className).toContain('bg-neon-rose');
  });

  it('displays metrics when available', () => {
    const data: EngineStatusResponse = {
      available: true,
      conditionsLoaded: 50,
      evaluationsPerSecond: 1200,
      avgLatencyUs: 85,
    };
    render(<EngineStatus data={data} loading={false} error={null} />);
    expect(screen.getByTestId('engine-conditions')).toHaveTextContent('50');
    expect(screen.getByTestId('engine-evaluations')).toHaveTextContent('1200');
    expect(screen.getByTestId('engine-latency')).toHaveTextContent('85us');
  });
});
