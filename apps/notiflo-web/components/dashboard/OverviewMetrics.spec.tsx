import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import OverviewMetrics from './OverviewMetrics';
import { DashboardOverview } from '../../lib/types';

const mockData: DashboardOverview = {
  totalNotificationsSent: 10000,
  totalDelivered: 9550,
  totalFailed: 450,
  deliveryRate: 95.5,
  activeCampaigns: 12,
  activeWorkflows: 5,
  totalSubscribers: 3400,
  recentEvents: 200,
  channelBreakdown: [],
};

describe('OverviewMetrics', () => {
  it('renders loading state when loading=true', () => {
    render(<OverviewMetrics data={null} loading={true} error={null} />);
    expect(screen.getByTestId('overview-loading')).toHaveTextContent('Loading...');
  });

  it('renders error state when error is set', () => {
    render(<OverviewMetrics data={null} loading={false} error="Something went wrong" />);
    expect(screen.getByTestId('overview-error')).toHaveTextContent('Something went wrong');
  });

  it('renders 6 KPI cards with correct values', () => {
    render(<OverviewMetrics data={mockData} loading={false} error={null} />);
    expect(screen.getByTestId('overview-metrics')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-totalSent')).toHaveTextContent('10000');
    expect(screen.getByTestId('kpi-delivered')).toHaveTextContent('9550');
    expect(screen.getByTestId('kpi-failed')).toHaveTextContent('450');
    expect(screen.getByTestId('kpi-activeCampaigns')).toHaveTextContent('12');
    expect(screen.getByTestId('kpi-totalSubscribers')).toHaveTextContent('3400');
  });

  it('displays deliveryRate as percentage', () => {
    render(<OverviewMetrics data={mockData} loading={false} error={null} />);
    expect(screen.getByTestId('kpi-deliveryRate')).toHaveTextContent('95.5%');
  });

  it('renders 0 values correctly', () => {
    const zeroData: DashboardOverview = {
      totalNotificationsSent: 0,
      totalDelivered: 0,
      totalFailed: 0,
      deliveryRate: 0,
      activeCampaigns: 0,
      activeWorkflows: 0,
      totalSubscribers: 0,
      recentEvents: 0,
      channelBreakdown: [],
    };
    render(<OverviewMetrics data={zeroData} loading={false} error={null} />);
    expect(screen.getByTestId('kpi-totalSent')).toHaveTextContent('0');
    expect(screen.getByTestId('kpi-deliveryRate')).toHaveTextContent('0%');
  });
});
