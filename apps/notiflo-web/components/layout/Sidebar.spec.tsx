import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/router';
import { Sidebar } from './Sidebar';

jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ pathname: '/dashboard' } as any);
  });

  it('renders all three nav links', () => {
    render(<Sidebar />);
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('nav-notifications')).toBeInTheDocument();
  });

  it('highlights active link based on pathname', () => {
    mockUseRouter.mockReturnValue({ pathname: '/alerts' } as any);
    render(<Sidebar />);

    const alertsLink = screen.getByTestId('nav-alerts');
    const dashboardLink = screen.getByTestId('nav-dashboard');

    expect(alertsLink.className).toMatch(/bg-neon-cyan/);
    expect(dashboardLink.className).not.toMatch(/bg-neon-cyan/);
  });

  it('links point to correct paths', () => {
    render(<Sidebar />);
    expect(screen.getByTestId('nav-dashboard').closest('a')).toHaveAttribute('href', '/dashboard');
    expect(screen.getByTestId('nav-alerts').closest('a')).toHaveAttribute('href', '/alerts');
    expect(screen.getByTestId('nav-notifications').closest('a')).toHaveAttribute('href', '/notifications');
  });
});
