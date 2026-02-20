import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubmitTickButton from './SubmitTickButton';
import { submitTick } from '../../lib/api-client';

jest.mock('../../lib/api-client', () => ({
  submitTick: jest.fn(),
}));

const mockedSubmitTick = submitTick as jest.MockedFunction<typeof submitTick>;

describe('SubmitTickButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders symbol and value inputs and submit button', () => {
    render(<SubmitTickButton />);
    expect(screen.getByTestId('tick-form')).toBeInTheDocument();
    expect(screen.getByTestId('tick-symbol')).toBeInTheDocument();
    expect(screen.getByTestId('tick-value')).toBeInTheDocument();
    expect(screen.getByTestId('tick-submit')).toBeInTheDocument();
  });

  it('submit is disabled when symbol is empty', () => {
    render(<SubmitTickButton />);
    expect(screen.getByTestId('tick-submit')).toBeDisabled();
  });

  it('calls submitTick with correct payload', async () => {
    const now = 1700000000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    mockedSubmitTick.mockResolvedValueOnce({ matches: [], count: 3 });

    render(<SubmitTickButton />);
    await userEvent.type(screen.getByTestId('tick-symbol'), 'AAPL');
    await userEvent.type(screen.getByTestId('tick-value'), '150');
    await userEvent.click(screen.getByTestId('tick-submit'));

    await waitFor(() => {
      expect(mockedSubmitTick).toHaveBeenCalledWith({
        symbol: 'AAPL',
        value: 150,
        timestampUs: now * 1000,
      });
    });

    jest.restoreAllMocks();
  });

  it('displays result count after submission', async () => {
    mockedSubmitTick.mockResolvedValueOnce({ matches: [{}, {}, {}], count: 3 });

    render(<SubmitTickButton />);
    await userEvent.type(screen.getByTestId('tick-symbol'), 'AAPL');
    await userEvent.type(screen.getByTestId('tick-value'), '150');
    await userEvent.click(screen.getByTestId('tick-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('tick-result')).toHaveTextContent('3 matches found');
    });
  });

  it('displays error on failure', async () => {
    mockedSubmitTick.mockRejectedValueOnce(new Error('Server error'));

    render(<SubmitTickButton />);
    await userEvent.type(screen.getByTestId('tick-symbol'), 'AAPL');
    await userEvent.type(screen.getByTestId('tick-value'), '150');
    await userEvent.click(screen.getByTestId('tick-submit'));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});
