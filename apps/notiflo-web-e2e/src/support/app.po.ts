// Page object helpers for Notiflo E2E tests

// Navigation
export const getNavDashboard = () => cy.get('[data-testid="nav-dashboard"]');
export const getNavAlerts = () => cy.get('[data-testid="nav-alerts"]');
export const getNavNotifications = () => cy.get('[data-testid="nav-notifications"]');

// Dashboard
export const getOverviewMetrics = () => cy.get('[data-testid="overview-metrics"]');
export const getChannelHealthGrid = () => cy.get('[data-testid="channel-health-grid"]');
export const getEngineStatus = () => cy.get('[data-testid="engine-status"]');

// Alerts
export const getAlertForm = () => cy.get('[data-testid="alert-form"]');
export const getAlertSymbol = () => cy.get('[data-testid="alert-symbol"]');
export const getAlertSubscriber = () => cy.get('[data-testid="alert-subscriber"]');
export const getAlertSubmit = () => cy.get('[data-testid="alert-submit"]');
export const getAlertsTable = () => cy.get('[data-testid="alerts-table"]');

// Tick
export const getTickForm = () => cy.get('[data-testid="tick-form"]');
export const getTickSymbol = () => cy.get('[data-testid="tick-symbol"]');
export const getTickValue = () => cy.get('[data-testid="tick-value"]');
export const getTickSubmit = () => cy.get('[data-testid="tick-submit"]');
export const getTickResult = () => cy.get('[data-testid="tick-result"]');

// Notifications
export const getNotificationsTable = () => cy.get('[data-testid="notifications-table"]');
