import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import ChannelHealthGrid from './ChannelHealthGrid';
import { ChannelHealth } from '../../lib/types';

const mockChannels: ChannelHealth[] = [
  {
    channel: 'email',
    status: 'healthy',
    throughputPerSecond: 150,
    errorRate: 0.5,
    avgLatencyMs: 230,
    activeProviders: 2,
    circuitBreakerState: 'closed',
  },
  {
    channel: 'sms',
    status: 'degraded',
    throughputPerSecond: 80,
    errorRate: 2.1,
    avgLatencyMs: 450,
    activeProviders: 1,
    circuitBreakerState: 'half-open',
  },
];

describe('ChannelHealthGrid', () => {
  it('renders loading state', () => {
    render(<ChannelHealthGrid data={null} loading={true} error={null} />);
    expect(screen.getByTestId('channel-health-loading')).toHaveTextContent('Loading...');
  });

  it('renders error state', () => {
    render(<ChannelHealthGrid data={null} loading={false} error="Failed to load" />);
    expect(screen.getByTestId('channel-health-error')).toHaveTextContent('Failed to load');
  });

  it('renders correct number of channel cards', () => {
    render(<ChannelHealthGrid data={mockChannels} loading={false} error={null} />);
    expect(screen.getByTestId('channel-health-grid')).toBeInTheDocument();
    expect(screen.getByTestId('channel-card-email')).toBeInTheDocument();
    expect(screen.getByTestId('channel-card-sms')).toBeInTheDocument();
  });

  it('renders empty state when data is empty array', () => {
    render(<ChannelHealthGrid data={[]} loading={false} error={null} />);
    expect(screen.getByTestId('channel-health-empty')).toHaveTextContent('No channel data available.');
  });
});
