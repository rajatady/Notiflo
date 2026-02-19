import { renderHook, waitFor } from '@testing-library/react';
import { useEngineStatus } from './useEngineStatus';
import { getEngineStatus } from '../lib/api-client';

jest.mock('../lib/api-client', () => ({
  getEngineStatus: jest.fn(),
}));

const mockGetEngineStatus = getEngineStatus as jest.MockedFunction<typeof getEngineStatus>;

describe('useEngineStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should start with loading state', () => {
    mockGetEngineStatus.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useEngineStatus());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should return data on success', async () => {
    const mockData = {
      available: true,
      conditionsLoaded: 10,
      evaluationsPerSecond: 500,
      avgLatencyUs: 120,
    };
    mockGetEngineStatus.mockResolvedValue(mockData);
    const { result } = renderHook(() => useEngineStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should return error on failure', async () => {
    mockGetEngineStatus.mockRejectedValue(new Error('Service unavailable'));
    const { result } = renderHook(() => useEngineStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Service unavailable');
    expect(result.current.data).toBeNull();
  });

  it('should support refetch', async () => {
    mockGetEngineStatus.mockResolvedValue({ available: true });
    const { result } = renderHook(() => useEngineStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetEngineStatus).toHaveBeenCalledTimes(1);

    result.current.refetch();
    await waitFor(() => expect(mockGetEngineStatus).toHaveBeenCalledTimes(2));
  });
});
