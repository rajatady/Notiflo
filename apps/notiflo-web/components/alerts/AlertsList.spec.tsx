import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import AlertsList from './AlertsList';
import { Alert } from '../../lib/types';

const mockAlerts: Alert[] = [
  {
    _id: 'alert-1',
    organizationId: 'org-1',
    subscriberId: 'sub-1',
    symbol: 'AAPL',
    strategyType: 'threshold_crossing',
    strategyParams: { threshold: 150 },
    channels: ['email', 'sms'],
    active: true,
    name: 'Apple Alert',
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    _id: 'alert-2',
    organizationId: 'org-1',
    subscriberId: 'sub-2',
    symbol: 'GOOG',
    strategyType: 'moving_average_crossover',
    strategyParams: {},
    channels: ['push'],
    active: false,
    name: 'Google Alert',
    createdAt: '2026-01-16T12:00:00Z',
  },
];

describe('AlertsList', () => {
  it('renders loading state', () => {
    render(<AlertsList alerts={null} loading={true} error={null} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<AlertsList alerts={null} loading={false} error="Failed to load" />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('renders empty state with "No alerts" message', () => {
    render(<AlertsList alerts={[]} loading={false} error={null} />);
    expect(screen.getByText('No alerts')).toBeInTheDocument();
  });

  it('renders table with correct columns', () => {
    render(<AlertsList alerts={mockAlerts} loading={false} error={null} />);
    expect(screen.getByTestId('alerts-table')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Symbol')).toBeInTheDocument();
    expect(screen.getByText('Strategy')).toBeInTheDocument();
    expect(screen.getByText('Channels')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('renders alert data correctly', () => {
    render(<AlertsList alerts={mockAlerts} loading={false} error={null} />);
    expect(screen.getByTestId('alert-row-alert-1')).toBeInTheDocument();
    expect(screen.getByTestId('alert-row-alert-2')).toBeInTheDocument();
    expect(screen.getByText('Apple Alert')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('GOOG')).toBeInTheDocument();
  });

  it('shows active/inactive status badge', () => {
    render(<AlertsList alerts={mockAlerts} loading={false} error={null} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });
});
