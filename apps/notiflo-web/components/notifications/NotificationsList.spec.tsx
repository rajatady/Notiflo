import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import NotificationsList from './NotificationsList';
import { NotificationRecord } from '../../lib/types';

const mockNotifications: NotificationRecord[] = [
  {
    _id: 'notif-1',
    organizationId: 'org-1',
    subscriberId: 'sub-1',
    channel: 'email',
    status: 'delivered',
    provider: 'sendgrid',
    content: { subject: 'Alert' },
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:01:00Z',
    sentAt: '2026-01-15T10:00:30Z',
  },
  {
    _id: 'notif-2',
    organizationId: 'org-1',
    subscriberId: 'sub-2',
    channel: 'sms',
    status: 'failed',
    provider: 'twilio',
    content: { body: 'Alert triggered' },
    result: { success: false, error: 'Invalid number' },
    createdAt: '2026-01-16T12:00:00Z',
    updatedAt: '2026-01-16T12:00:05Z',
  },
  {
    _id: 'notif-3',
    organizationId: 'org-1',
    subscriberId: 'sub-3',
    channel: 'push',
    status: 'pending',
    provider: 'fcm',
    content: { title: 'New alert' },
    createdAt: '2026-01-17T08:00:00Z',
    updatedAt: '2026-01-17T08:00:00Z',
  },
];

describe('NotificationsList', () => {
  it('renders loading state', () => {
    render(<NotificationsList notifications={null} loading={true} error={null} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<NotificationsList notifications={null} loading={false} error="Failed to fetch" />);
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('renders empty state with "No notifications" message', () => {
    render(<NotificationsList notifications={[]} loading={false} error={null} />);
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('renders table with correct headers', () => {
    render(<NotificationsList notifications={mockNotifications} loading={false} error={null} />);
    expect(screen.getByTestId('notifications-table')).toBeInTheDocument();
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Provider')).toBeInTheDocument();
    expect(screen.getByText('Subscriber')).toBeInTheDocument();
    expect(screen.getByText('Sent At')).toBeInTheDocument();
  });

  it('renders notification data correctly', () => {
    render(<NotificationsList notifications={mockNotifications} loading={false} error={null} />);
    expect(screen.getByText('notif-1')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('sendgrid')).toBeInTheDocument();
    expect(screen.getByText('sub-1')).toBeInTheDocument();
  });

  it('renders status badges with correct colors', () => {
    render(<NotificationsList notifications={mockNotifications} loading={false} error={null} />);

    const deliveredBadge = screen.getByTestId('status-badge-delivered');
    expect(deliveredBadge).toHaveTextContent('delivered');
    expect(deliveredBadge.className).toMatch(/green/);

    const failedBadge = screen.getByTestId('status-badge-failed');
    expect(failedBadge).toHaveTextContent('failed');
    expect(failedBadge.className).toMatch(/rose/);

    const pendingBadge = screen.getByTestId('status-badge-pending');
    expect(pendingBadge).toHaveTextContent('pending');
    expect(pendingBadge.className).toMatch(/amber/);
  });
});
