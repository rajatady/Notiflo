import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import ChannelHealthCard from './ChannelHealthCard';
import { ChannelHealth } from '../../lib/types';

const makeChannel = (overrides: Partial<ChannelHealth> = {}): ChannelHealth => ({
  channel: 'email',
  status: 'healthy',
  throughputPerSecond: 150,
  errorRate: 0.5,
  avgLatencyMs: 230,
  activeProviders: 2,
  circuitBreakerState: 'closed',
  ...overrides,
});

describe('ChannelHealthCard', () => {
  it('renders channel name', () => {
    render(<ChannelHealthCard channel={makeChannel()} />);
    expect(screen.getByText('email')).toBeInTheDocument();
  });

  it('renders correct status badge color for healthy', () => {
    render(<ChannelHealthCard channel={makeChannel({ status: 'healthy' })} />);
    const badge = screen.getByTestId('status-badge-email');
    expect(badge).toHaveTextContent('healthy');
    expect(badge.className).toMatch(/green/);
  });

  it('renders correct status badge color for degraded', () => {
    render(<ChannelHealthCard channel={makeChannel({ status: 'degraded' })} />);
    const badge = screen.getByTestId('status-badge-email');
    expect(badge).toHaveTextContent('degraded');
    expect(badge.className).toMatch(/amber/);
  });

  it('renders correct status badge color for down', () => {
    render(<ChannelHealthCard channel={makeChannel({ status: 'down' })} />);
    const badge = screen.getByTestId('status-badge-email');
    expect(badge).toHaveTextContent('down');
    expect(badge.className).toMatch(/rose/);
  });

  it('displays throughput and latency values', () => {
    render(<ChannelHealthCard channel={makeChannel({ throughputPerSecond: 150, avgLatencyMs: 230 })} />);
    expect(screen.getByText('150/s')).toBeInTheDocument();
    expect(screen.getByText('230ms')).toBeInTheDocument();
  });
});
