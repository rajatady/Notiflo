import React from 'react';
import NotificationsList from '../components/notifications/NotificationsList';
import { useNotifications } from '../hooks/useNotifications';

export default function NotificationsPage() {
  const { data, loading, error } = useNotifications();

  return (
    <div data-testid="notifications-page" className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Notifications</h1>
        <p className="text-text-secondary mt-1">Track and monitor all notification activity across channels</p>
      </div>
      <NotificationsList
        notifications={data}
        loading={loading}
        error={error}
      />
    </div>
  );
}
