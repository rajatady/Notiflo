import React from 'react';
import { ChannelHealth } from '../../lib/types';
import ChannelHealthCard from './ChannelHealthCard';

interface ChannelHealthGridProps {
  data: ChannelHealth[] | null;
  loading: boolean;
  error: string | null;
}

export default function ChannelHealthGrid({ data, loading, error }: ChannelHealthGridProps) {
  if (loading) {
    return (
      <div data-testid="channel-health-loading" className="text-text-muted">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="channel-health-error" className="text-neon-rose">
        {error}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div data-testid="channel-health-empty" className="text-text-muted">
        No channel data available.
      </div>
    );
  }

  return (
    <div data-testid="channel-health-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.map((channel) => (
        <ChannelHealthCard key={channel.channel} channel={channel} />
      ))}
    </div>
  );
}
