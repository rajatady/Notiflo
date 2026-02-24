import {
  DashboardOverview,
  ChannelHealth,
  EngineStatusResponse,
  Alert,
  CreateAlertPayload,
  SubmitTickPayload,
  TickResult,
  NotificationRecord,
  Connector,
  CreateConnectorPayload,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `API error: ${res.status}`);
  }
  return res.json();
}

export const getDashboardOverview = (orgId: string) =>
  apiFetch<DashboardOverview>(`/dashboard/overview?orgId=${orgId}`);

export const getChannelHealth = (orgId: string) =>
  apiFetch<ChannelHealth[]>(`/dashboard/channels?orgId=${orgId}`);

export const getEngineStatus = () =>
  apiFetch<EngineStatusResponse>('/dashboard/engine');

export const getAlerts = (orgId: string) =>
  apiFetch<Alert[]>(`/alerts?organizationId=${orgId}`);

export const createAlert = (data: CreateAlertPayload) =>
  apiFetch<Alert>('/alerts', { method: 'POST', body: JSON.stringify(data) });

export const submitTick = (data: SubmitTickPayload) =>
  apiFetch<TickResult>('/alerts/ticks', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getNotifications = (orgId: string) =>
  apiFetch<NotificationRecord[]>(`/notifications?organizationId=${orgId}`);

export const getConnectors = (orgId: string) =>
  apiFetch<Connector[]>(`/connectors?organizationId=${orgId}`);

export const createConnector = (data: CreateConnectorPayload) =>
  apiFetch<Connector>('/connectors', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteConnector = (id: string) =>
  apiFetch<Connector>(`/connectors/${id}`, { method: 'DELETE' });

export const startLoadTest = (config: import('./types').LoadTestConfig) =>
  apiFetch<{ testId: string }>('/load-test/start', {
    method: 'POST',
    body: JSON.stringify(config),
  });

export const cancelLoadTest = (testId: string) =>
  apiFetch<{ cancelled: boolean }>(`/load-test/${testId}/cancel`, {
    method: 'POST',
  });
