import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateAlertForm from './CreateAlertForm';
import { createAlert } from '../../lib/api-client';

jest.mock('../../lib/api-client', () => ({
  createAlert: jest.fn(),
}));

const mockedCreateAlert = createAlert as jest.MockedFunction<typeof createAlert>;

describe('CreateAlertForm', () => {
  const onCreated = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all form fields', () => {
    render(<CreateAlertForm onCreated={onCreated} />);
    expect(screen.getByTestId('alert-form')).toBeInTheDocument();
    expect(screen.getByTestId('alert-name')).toBeInTheDocument();
    expect(screen.getByTestId('alert-symbol')).toBeInTheDocument();
    expect(screen.getByTestId('alert-strategy')).toBeInTheDocument();
    expect(screen.getByTestId('alert-target-price')).toBeInTheDocument();
    expect(screen.getByTestId('alert-direction')).toBeInTheDocument();
    expect(screen.getByTestId('alert-channel-email')).toBeInTheDocument();
    expect(screen.getByTestId('alert-channel-sms')).toBeInTheDocument();
    expect(screen.getByTestId('alert-channel-push')).toBeInTheDocument();
    expect(screen.getByTestId('alert-channel-in_app')).toBeInTheDocument();
    expect(screen.getByTestId('alert-subscriber')).toBeInTheDocument();
    expect(screen.getByTestId('alert-submit')).toBeInTheDocument();
  });

  it('submit button is disabled when required fields empty', () => {
    render(<CreateAlertForm onCreated={onCreated} />);
    expect(screen.getByTestId('alert-submit')).toBeDisabled();
  });

  it('enables submit when required fields filled', async () => {
    render(<CreateAlertForm onCreated={onCreated} />);
    await userEvent.type(screen.getByTestId('alert-symbol'), 'AAPL');
    await userEvent.type(screen.getByTestId('alert-subscriber'), 'sub-1');
    expect(screen.getByTestId('alert-submit')).toBeEnabled();
  });

  it('calls createAlert with correct payload on submit', async () => {
    mockedCreateAlert.mockResolvedValueOnce({
      _id: '1',
      organizationId: 'default-org',
      subscriberId: 'sub-1',
      symbol: 'AAPL',
      strategyType: 'threshold_crossing',
      strategyParams: { threshold: 150, operator: 'cross_above' },
      channels: ['email'],
      active: true,
      createdAt: new Date().toISOString(),
    });

    render(<CreateAlertForm onCreated={onCreated} />);
    await userEvent.type(screen.getByTestId('alert-name'), 'My Alert');
    await userEvent.type(screen.getByTestId('alert-symbol'), 'AAPL');
    await userEvent.type(screen.getByTestId('alert-target-price'), '150');
    await userEvent.click(screen.getByTestId('alert-channel-email'));
    await userEvent.type(screen.getByTestId('alert-subscriber'), 'sub-1');
    await userEvent.click(screen.getByTestId('alert-submit'));

    await waitFor(() => {
      expect(mockedCreateAlert).toHaveBeenCalledWith({
        organizationId: 'default-org',
        subscriberId: 'sub-1',
        symbol: 'AAPL',
        strategyType: 'threshold_crossing',
        strategyParams: { threshold: 150, operator: 'cross_above' },
        channels: ['email'],
        name: 'My Alert',
      });
    });
  });

  it('displays success message on successful creation', async () => {
    mockedCreateAlert.mockResolvedValueOnce({
      _id: '1',
      organizationId: 'default-org',
      subscriberId: 'sub-1',
      symbol: 'AAPL',
      strategyType: 'threshold_crossing',
      strategyParams: {},
      channels: ['email'],
      active: true,
      createdAt: new Date().toISOString(),
    });

    render(<CreateAlertForm onCreated={onCreated} />);
    await userEvent.type(screen.getByTestId('alert-symbol'), 'AAPL');
    await userEvent.type(screen.getByTestId('alert-subscriber'), 'sub-1');
    await userEvent.click(screen.getByTestId('alert-channel-email'));
    await userEvent.click(screen.getByTestId('alert-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('alert-success')).toHaveTextContent('Alert created successfully');
    });
  });

  it('displays error message on API failure', async () => {
    mockedCreateAlert.mockRejectedValueOnce(new Error('Network error'));

    render(<CreateAlertForm onCreated={onCreated} />);
    await userEvent.type(screen.getByTestId('alert-symbol'), 'AAPL');
    await userEvent.type(screen.getByTestId('alert-subscriber'), 'sub-1');
    await userEvent.click(screen.getByTestId('alert-channel-email'));
    await userEvent.click(screen.getByTestId('alert-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('alert-error')).toHaveTextContent('Network error');
    });
  });

  it('calls onCreated callback after successful creation', async () => {
    mockedCreateAlert.mockResolvedValueOnce({
      _id: '1',
      organizationId: 'default-org',
      subscriberId: 'sub-1',
      symbol: 'AAPL',
      strategyType: 'threshold_crossing',
      strategyParams: {},
      channels: [],
      active: true,
      createdAt: new Date().toISOString(),
    });

    render(<CreateAlertForm onCreated={onCreated} />);
    await userEvent.type(screen.getByTestId('alert-symbol'), 'AAPL');
    await userEvent.type(screen.getByTestId('alert-subscriber'), 'sub-1');
    await userEvent.click(screen.getByTestId('alert-submit'));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
  });
});
