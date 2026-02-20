import React from 'react';
import { NotificationRecord, NotificationStatus } from '../../lib/types';

interface NotificationsListProps {
  notifications: NotificationRecord[] | null;
  loading: boolean;
  error: string | null;
}

function getStatusBadge(status: NotificationStatus): string {
  switch (status) {
    case 'delivered':
    case 'sent':
      return 'badge-green';
    case 'failed':
    case 'bounced':
      return 'badge-rose';
    case 'pending':
    case 'queued':
      return 'badge-amber';
    case 'sending':
      return 'badge-cyan';
    case 'opened':
    case 'clicked':
      return 'badge-violet';
    default:
      return 'badge-green';
  }
}

export default function NotificationsList({ notifications, loading, error }: NotificationsListProps) {
  if (loading) {
    return <div className="text-text-muted py-4">Loading...</div>;
  }

  if (error) {
    return <div className="text-neon-rose py-4">{error}</div>;
  }

  if (!notifications || notifications.length === 0) {
    return <div className="text-text-muted py-4">No notifications</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table data-testid="notifications-table" className="min-w-full">
        <thead className="bg-elevated border-b border-border">
          <tr>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">ID</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Channel</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Provider</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Subscriber</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Sent At</th>
          </tr>
        </thead>
        <tbody>
          {notifications.map((notif, index) => (
            <tr
              key={notif._id}
              className={`${index % 2 === 0 ? 'bg-surface' : 'bg-surface/50'} border-b border-border/50 hover:bg-elevated/50`}
            >
              <td className="px-4 py-3 text-xs font-mono text-text-muted">{notif._id}</td>
              <td className="px-4 py-3 text-sm text-text-secondary">{notif.channel}</td>
              <td className="px-4 py-3 text-sm">
                <span
                  data-testid={`status-badge-${notif.status}`}
                  className={getStatusBadge(notif.status)}
                >
                  {notif.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-text-secondary">{notif.provider}</td>
              <td className="px-4 py-3 text-sm text-text-secondary">{notif.subscriberId}</td>
              <td className="px-4 py-3 text-xs font-mono text-text-muted">
                {notif.sentAt ? new Date(notif.sentAt).toLocaleString() : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
