import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AggregateByToggle } from '../AggregateByToggle';

describe('AggregateByToggle', () => {
	afterEach(() => {
		cleanup();
	});

	describe('usual', () => {
		it('renders the "Aggregate by:" label and Bird/Encounter radios', () => {
			render(<AggregateByToggle value="bird" onChange={() => {}} />);
			expect(screen.getByText('Aggregate by:')).not.toBeNull();
			expect(screen.getByRole('radio', { name: 'Bird' })).toBeInstanceOf(
				HTMLInputElement
			);
			expect(screen.getByRole('radio', { name: 'Encounter' })).toBeInstanceOf(
				HTMLInputElement
			);
		});

		it('calls onChange with the corresponding value when a radio is clicked', () => {
			const onChange = vi.fn();
			render(<AggregateByToggle value="bird" onChange={onChange} />);
			fireEvent.click(screen.getByRole('radio', { name: 'Encounter' }));
			expect(onChange).toHaveBeenCalledWith('encounter');
		});
	});

	describe('structure', () => {
		it('checks the Bird radio when value is "bird"', () => {
			render(<AggregateByToggle value="bird" onChange={() => {}} />);
			expect(screen.getByRole('radio', { name: 'Bird' })).toHaveProperty(
				'checked',
				true
			);
			expect(screen.getByRole('radio', { name: 'Encounter' })).toHaveProperty(
				'checked',
				false
			);
		});

		it('checks the Encounter radio when value is "encounter"', () => {
			render(<AggregateByToggle value="encounter" onChange={() => {}} />);
			expect(screen.getByRole('radio', { name: 'Encounter' })).toHaveProperty(
				'checked',
				true
			);
			expect(screen.getByRole('radio', { name: 'Bird' })).toHaveProperty(
				'checked',
				false
			);
		});
	});
});
