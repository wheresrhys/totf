import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CombineYearsToggle } from '../CombineYearsToggle';

describe('CombineYearsToggle', () => {
	afterEach(() => {
		cleanup();
	});

	describe('Usual', () => {
		it('renders the "Combine years:" label and Combined/By year radios', () => {
			render(<CombineYearsToggle value={true} onChange={() => {}} />);
			expect(screen.getByText('Combine years:')).not.toBeNull();
			expect(screen.getByRole('radio', { name: 'Combined' })).toBeInstanceOf(
				HTMLInputElement
			);
			expect(screen.getByRole('radio', { name: 'By year' })).toBeInstanceOf(
				HTMLInputElement
			);
		});

		it('calls onChange with the corresponding value when a radio is clicked', () => {
			const onChange = vi.fn();
			render(<CombineYearsToggle value={true} onChange={onChange} />);
			fireEvent.click(screen.getByRole('radio', { name: 'By year' }));
			expect(onChange).toHaveBeenCalledWith(false);
		});
	});

	describe('Structure', () => {
		it('checks the Combined radio when value is true', () => {
			render(<CombineYearsToggle value={true} onChange={() => {}} />);
			expect(screen.getByRole('radio', { name: 'Combined' })).toHaveProperty(
				'checked',
				true
			);
			expect(screen.getByRole('radio', { name: 'By year' })).toHaveProperty(
				'checked',
				false
			);
		});

		it('checks the By year radio when value is false', () => {
			render(<CombineYearsToggle value={false} onChange={() => {}} />);
			expect(screen.getByRole('radio', { name: 'By year' })).toHaveProperty(
				'checked',
				true
			);
			expect(screen.getByRole('radio', { name: 'Combined' })).toHaveProperty(
				'checked',
				false
			);
		});
	});
});
