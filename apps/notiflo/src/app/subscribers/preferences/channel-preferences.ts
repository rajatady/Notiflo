import { Channel } from '../../core';

export interface ChannelPreference {
  enabled: boolean;
  providerId?: string;
}

/**
 * Checks whether a specific channel is enabled in the subscriber's preferences.
 * Returns false if the channel has no preference entry.
 */
export function isChannelEnabled(
  preferences: Map<string, ChannelPreference>,
  channel: Channel,
): boolean {
  const pref = preferences.get(channel);
  return pref ? pref.enabled : false;
}

/**
 * Returns an array of all channels that are enabled in the subscriber's preferences.
 */
export function getPreferredChannels(
  preferences: Map<string, ChannelPreference>,
): Channel[] {
  const preferred: Channel[] = [];
  preferences.forEach((pref, key) => {
    if (pref.enabled) {
      preferred.push(key as Channel);
    }
  });
  return preferred;
}
