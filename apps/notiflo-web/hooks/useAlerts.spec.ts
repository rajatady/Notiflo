import { renderHook, waitFor } from '@testing-library/react';
import { useAlerts } from './useAlerts';
import { getAlerts } from '../lib/api-client';

jest.mock('../lib/api-client', () => ({
  getAlerts: jest.fn(),
}));

const mockGetAlerts = getAlerts as jest.MockedFunction<typeof getAlerts>;

describe('useAlerts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should start with loading state', () => {
    mockGetAlerts.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAlerts());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should return data on success', async () => {
    const mockData = [
      {
        _id: '1',
        organizationId: 'default-org',
        subscriberId: 'sub-1',
        symbol: 'BTC',
        strategyType: 'threshold',
        strategyParams: { threshold: 50000 },
        channels: ['email'],
        active: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    mockGetAlerts.mockResolvedValue(mockData);
    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should return error on failure', async () => {
    mockGetAlerts.mockRejectedValue(new Error('Forbidden'));
    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Forbidden');
    expect(result.current.data).toBeNull();
  });

  it('should support refetch', async () => {
    mockGetAlerts.mockResolvedValue([]);
    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetAlerts).toHaveBeenCalledTimes(1);

    result.current.refetch();
    await waitFor(() => expect(mockGetAlerts).toHaveBeenCalledTimes(2));
  });
});
