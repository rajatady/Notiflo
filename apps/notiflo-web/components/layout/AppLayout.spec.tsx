import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AppLayout } from './AppLayout';

jest.mock('next/router', () => ({
  useRouter: jest.fn().mockReturnValue({ pathname: '/dashboard' }),
}));

describe('AppLayout', () => {
  it('renders children', () => {
    render(
      <AppLayout>
        <div data-testid="child-content">Hello</div>
      </AppLayout>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('renders sidebar', () => {
    render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>
    );
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('nav-notifications')).toBeInTheDocument();
  });

  it('has correct layout structure', () => {
    render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>
    );
    const layout = screen.getByTestId('app-layout');
    expect(layout).toBeInTheDocument();
    expect(layout.className).toMatch(/flex/);
  });
});
