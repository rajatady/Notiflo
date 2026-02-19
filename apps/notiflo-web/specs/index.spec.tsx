import React from 'react';
import { render } from '@testing-library/react';

const mockReplace = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

import Index from '../pages/index';

describe('Index', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<Index />);
    expect(baseElement).toBeTruthy();
  });

  it('should redirect to /dashboard', () => {
    render(<Index />);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });
});
