import {
  getDashboardOverview,
  getChannelHealth,
  getEngineStatus,
  getAlerts,
  createAlert,
  submitTick,
  getNotifications,
} from './api-client';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function okResponse(body: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  };
}

function errorResponse(status: number, body?: unknown) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body ?? {}),
  };
}

describe('api-client', () => {
  it('should prepend API_BASE to path', async () => {
    mockFetch.mockResolvedValue(okResponse({ available: true }));
    await getEngineStatus();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/dashboard/engine',
      expect.any(Object)
    );
  });

  it('should parse JSON response on success', async () => {
    const data = { totalNotificationsSent: 100 };
    mockFetch.mockResolvedValue(okResponse(data));
    const result = await getDashboardOverview('org-1');
    expect(result).toEqual(data);
  });

  it('should throw Error with message on non-ok response', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(400, { message: 'Bad request' })
    );
    await expect(getAlerts('org-1')).rejects.toThrow('Bad request');
  });

  it('should throw generic error when response has no message', async () => {
    mockFetch.mockResolvedValue(errorResponse(500));
    await expect(getChannelHealth('org-1')).rejects.toThrow('API error: 500');
  });

  it('should set Content-Type to application/json', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await getNotifications('org-1');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('should pass method and body for POST requests', async () => {
    mockFetch.mockResolvedValue(okResponse({ _id: '1' }));
    const payload = {
      organizationId: 'org-1',
      subscriberId: 'sub-1',
      symbol: 'BTC',
      strategyType: 'threshold',
      strategyParams: { value: 50000 },
      channels: ['email'],
    };
    await createAlert(payload);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual(payload);
  });

  it('should pass method and body for submitTick POST', async () => {
    mockFetch.mockResolvedValue(okResponse({ matches: [], count: 0 }));
    const tickPayload = {
      symbol: 'ETH',
      value: 3000,
      timestampUs: Date.now() * 1000,
    };
    await submitTick(tickPayload);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/alerts/ticks');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual(tickPayload);
  });
});
