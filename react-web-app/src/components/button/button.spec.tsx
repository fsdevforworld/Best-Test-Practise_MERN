import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import Button from './index';

describe('Components/Button', () => {
  describe('disabled prop', () => {
    it('should be disabled', () => {
      const fn = jest.fn();
      const { getByText } = render(<Button disabled title="My Button" onClick={fn} />);
      expect(getByText('My Button')).toBeDisabled();
      fireEvent.click(getByText('My Button'));
      expect(fn).not.toBeCalled();
    });

    it('should not be disabled', () => {
      const fn = jest.fn();
      const { getByText } = render(<Button title="My Button" onClick={fn} />);
      expect(getByText('My Button')).not.toBeDisabled();
      fireEvent.click(getByText('My Button'));
      expect(fn).toBeCalled();
    });
  });
});
