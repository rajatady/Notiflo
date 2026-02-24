import React from 'react';
import NotificationsList from '../components/notifications/NotificationsList';
import { useLiveNotifications } from '../hooks/useLiveNotifications';

export default function NotificationsPage() {
  const { notifications, loading, error, connected, count } =
    useLiveNotifications();

  return (
    <div
      data-testid="notifications-page"
      className="max-w-7xl mx-auto space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="text-text-secondary mt-1">
            Track and monitor all notification activity across channels
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-text-muted">
            {count > 0 && `${count} events`}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-mono">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? 'bg-neon-green' : 'bg-neon-rose'
              }`}
            />
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>
      <NotificationsList
        notifications={notifications.length > 0 ? notifications : null}
        loading={loading}
        error={error}
      />
    </div>
  );
}
