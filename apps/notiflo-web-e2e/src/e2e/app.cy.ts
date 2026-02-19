import {
  getNavDashboard,
  getNavAlerts,
  getNavNotifications,
} from '../support/app.po';

describe('Notiflo Navigation', () => {
  beforeEach(() => cy.visit('/'));

  it('should redirect to /dashboard from /', () => {
    cy.url().should('include', '/dashboard');
  });

  it('should render the sidebar with all nav links', () => {
    getNavDashboard().should('exist');
    getNavAlerts().should('exist');
    getNavNotifications().should('exist');
  });

  it('should navigate to alerts page', () => {
    getNavAlerts().click();
    cy.url().should('include', '/alerts');
    cy.get('[data-testid="alerts-page"]').should('exist');
  });

  it('should navigate to notifications page', () => {
    getNavNotifications().click();
    cy.url().should('include', '/notifications');
    cy.get('[data-testid="notifications-page"]').should('exist');
  });

  it('should navigate back to dashboard', () => {
    getNavAlerts().click();
    getNavDashboard().click();
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="dashboard-page"]').should('exist');
  });
});
