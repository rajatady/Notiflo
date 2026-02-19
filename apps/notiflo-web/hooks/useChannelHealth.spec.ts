import { renderHook, waitFor } from '@testing-library/react';
import { useChannelHealth } from './useChannelHealth';
import { getChannelHealth } from '../lib/api-client';

jest.mock('../lib/api-client', () => ({
  getChannelHealth: jest.fn(),
}));

const mockGetChannelHealth = getChannelHealth as jest.MockedFunction<typeof getChannelHealth>;

describe('useChannelHealth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should start with loading state', () => {
    mockGetChannelHealth.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useChannelHealth());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should return data on success', async () => {
    const mockData = [
      {
        channel: 'email',
        status: 'healthy' as const,
        throughputPerSecond: 100,
        errorRate: 0.01,
        avgLatencyMs: 50,
        activeProviders: 2,
        circuitBreakerState: 'closed',
      },
    ];
    mockGetChannelHealth.mockResolvedValue(mockData);
    const { result } = renderHook(() => useChannelHealth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should return error on failure', async () => {
    mockGetChannelHealth.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useChannelHealth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBeNull();
  });

  it('should support refetch', async () => {
    mockGetChannelHealth.mockResolvedValue([]);
    const { result } = renderHook(() => useChannelHealth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetChannelHealth).toHaveBeenCalledTimes(1);

    result.current.refetch();
    await waitFor(() => expect(mockGetChannelHealth).toHaveBeenCalledTimes(2));
  });
});
