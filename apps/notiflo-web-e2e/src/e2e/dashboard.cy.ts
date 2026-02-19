describe('Dashboard Page', () => {
  beforeEach(() => cy.visit('/dashboard'));

  it('should render the dashboard page heading', () => {
    cy.get('[data-testid="dashboard-page"]').should('exist');
    cy.contains('h1', 'Dashboard').should('be.visible');
  });

  it('should show overview metrics section (loading or data)', () => {
    // Either loading state or the actual metrics should appear
    cy.get('[data-testid="overview-metrics"], [data-testid="overview-loading"], [data-testid="overview-error"]')
      .should('exist');
  });

  it('should show channel health section', () => {
    cy.get('[data-testid="channel-health-grid"], [data-testid="channel-health-loading"], [data-testid="channel-health-error"], [data-testid="channel-health-empty"]')
      .should('exist');
  });

  it('should show engine status section', () => {
    cy.get('[data-testid="engine-status"], [data-testid="engine-status-loading"], [data-testid="engine-status-error"]')
      .should('exist');
  });
});
