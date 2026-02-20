import { renderHook, waitFor } from '@testing-library/react';
import { useNotifications } from './useNotifications';
import { getNotifications } from '../lib/api-client';

jest.mock('../lib/api-client', () => ({
  getNotifications: jest.fn(),
}));

const mockGetNotifications = getNotifications as jest.MockedFunction<typeof getNotifications>;

describe('useNotifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should start with loading state', () => {
    mockGetNotifications.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useNotifications());
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
        channel: 'email',
        status: 'delivered' as const,
        provider: 'sendgrid',
        content: { subject: 'Test' },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    mockGetNotifications.mockResolvedValue(mockData);
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should return error on failure', async () => {
    mockGetNotifications.mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Server error');
    expect(result.current.data).toBeNull();
  });

  it('should support refetch', async () => {
    mockGetNotifications.mockResolvedValue([]);
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetNotifications).toHaveBeenCalledTimes(1);

    result.current.refetch();
    await waitFor(() => expect(mockGetNotifications).toHaveBeenCalledTimes(2));
  });
});
