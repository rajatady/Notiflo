import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardOverview } from './useDashboardOverview';
import { getDashboardOverview } from '../lib/api-client';

jest.mock('../lib/api-client', () => ({
  getDashboardOverview: jest.fn(),
}));

const mockGetDashboardOverview = getDashboardOverview as jest.MockedFunction<typeof getDashboardOverview>;

describe('useDashboardOverview', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should start with loading state', () => {
    mockGetDashboardOverview.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDashboardOverview());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should return data on success', async () => {
    const mockData = {
      totalNotificationsSent: 100,
      totalDelivered: 90,
      totalFailed: 10,
      deliveryRate: 0.9,
      activeCampaigns: 5,
      activeWorkflows: 3,
      totalSubscribers: 1000,
      recentEvents: 50,
      channelBreakdown: [],
    };
    mockGetDashboardOverview.mockResolvedValue(mockData);
    const { result } = renderHook(() => useDashboardOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should return error on failure', async () => {
    mockGetDashboardOverview.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useDashboardOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBeNull();
  });

  it('should support refetch', async () => {
    const mockData = { totalNotificationsSent: 100 };
    mockGetDashboardOverview.mockResolvedValue(mockData as any);
    const { result } = renderHook(() => useDashboardOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetDashboardOverview).toHaveBeenCalledTimes(1);

    mockGetDashboardOverview.mockResolvedValue({ totalNotificationsSent: 200 } as any);
    result.current.refetch();
    await waitFor(() => expect(result.current.data).toEqual({ totalNotificationsSent: 200 }));
    expect(mockGetDashboardOverview).toHaveBeenCalledTimes(2);
  });
});
