import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { RingSearchForm } from '../RingSearchForm';
import { mockPush } from '@/vitest.setup';

describe('RingSearchForm', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders search input and button', () => {
		render(<RingSearchForm />);
		expect(screen.getByLabelText('ring number')).toBeDefined();
		expect(screen.getByRole('button', { name: 'Search' })).toBeDefined();
	});

	it('renders custom button text', () => {
		render(<RingSearchForm buttonText="Find bird" />);
		expect(screen.getByRole('button', { name: 'Find bird' })).toBeDefined();
	});

	it('pre-fills input with q prop', () => {
		render(<RingSearchForm q="BVB4138" />);
		const input = screen.getByLabelText('ring number') as HTMLInputElement;
		expect(input.defaultValue).toBe('BVB4138');
	});

	it('navigates to /bird?q=<ring> on submit', () => {
		render(<RingSearchForm />);
		const input = screen.getByLabelText('ring number') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'BVB4138' } });
		fireEvent.submit(
			screen.getByRole('button', { name: 'Search' }).closest('form')!
		);
		expect(mockPush).toHaveBeenCalledWith('/bird?q=BVB4138');
	});
});
