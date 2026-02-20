import {
  getAlertSymbol,
  getAlertSubscriber,
  getAlertSubmit,
  getTickSymbol,
  getTickValue,
  getTickSubmit,
  getNavNotifications,
} from '../support/app.po';

describe('Alert Flow - Golden Path', () => {
  beforeEach(() => cy.visit('/alerts'));

  it('should render the alerts page with form and table', () => {
    cy.get('[data-testid="alerts-page"]').should('exist');
    cy.get('[data-testid="alert-form"]').should('exist');
    cy.get('[data-testid="tick-form"]').should('exist');
  });

  it('should have submit button disabled when fields are empty', () => {
    getAlertSubmit().should('be.disabled');
  });

  it('should enable submit when required fields are filled', () => {
    getAlertSymbol().type('AAPL');
    getAlertSubscriber().type('sub-test-1');
    getAlertSubmit().should('not.be.disabled');
  });

  it('should create an alert and show success message', () => {
    // Intercept the API call
    cy.intercept('POST', '/api/alerts', {
      statusCode: 201,
      body: {
        _id: 'alert-e2e-1',
        organizationId: 'default-org',
        subscriberId: 'sub-test-1',
        symbol: 'AAPL',
        strategyType: 'threshold_crossing',
        strategyParams: { targetPrice: 150, direction: 'above' },
        channels: ['email'],
        active: true,
        createdAt: new Date().toISOString(),
      },
    }).as('createAlert');

    // Also intercept the refetch
    cy.intercept('GET', '/api/alerts*', {
      statusCode: 200,
      body: [
        {
          _id: 'alert-e2e-1',
          organizationId: 'default-org',
          subscriberId: 'sub-test-1',
          symbol: 'AAPL',
          strategyType: 'threshold_crossing',
          strategyParams: { targetPrice: 150, direction: 'above' },
          channels: ['email'],
          active: true,
          name: 'AAPL Alert',
          createdAt: new Date().toISOString(),
        },
      ],
    }).as('getAlerts');

    getAlertSymbol().type('AAPL');
    getAlertSubscriber().type('sub-test-1');
    cy.get('[data-testid="alert-target-price"]').type('150');
    cy.get('[data-testid="alert-channel-email"]').check({ force: true });
    getAlertSubmit().click();

    cy.wait('@createAlert');
    cy.get('[data-testid="alert-success"]').should('exist');
  });

  it('should submit a tick and show results', () => {
    cy.intercept('POST', '/api/alerts/ticks', {
      statusCode: 200,
      body: { matches: [{ alertId: 'alert-1' }], count: 1 },
    }).as('submitTick');

    getTickSymbol().type('AAPL');
    getTickValue().type('155');
    getTickSubmit().click();

    cy.wait('@submitTick');
    cy.get('[data-testid="tick-result"]').should('contain', '1 matches found');
  });

  it('should navigate to notifications page', () => {
    cy.intercept('GET', '/api/notifications*', {
      statusCode: 200,
      body: [
        {
          _id: 'notif-1',
          organizationId: 'default-org',
          subscriberId: 'sub-test-1',
          channel: 'email',
          status: 'delivered',
          provider: 'sendgrid',
          content: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sentAt: new Date().toISOString(),
        },
      ],
    }).as('getNotifications');

    getNavNotifications().click();
    cy.url().should('include', '/notifications');

    cy.wait('@getNotifications');
    cy.get('[data-testid="notifications-table"]').should('exist');
    cy.get('[data-testid="status-badge-delivered"]').should('exist');
  });
});
