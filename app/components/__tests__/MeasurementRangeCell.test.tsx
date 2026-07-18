import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MeasurementRangeCell } from '../MeasurementRangeCell';

function renderCell(
	range: Parameters<typeof MeasurementRangeCell>[0]['range']
) {
	const { container } = render(<MeasurementRangeCell range={range} />);
	return container;
}

describe('MeasurementRangeCell', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders nothing for an empty range', () => {
		const container = renderCell({ kind: 'empty' });
		expect(container.textContent).toBe('');
	});

	it('renders a single value', () => {
		const container = renderCell({ kind: 'single', value: 67 });
		expect(container.textContent).toBe('67');
		expect(container.querySelector('strong')).toBeNull();
	});

	it('renders a plain range', () => {
		const container = renderCell({ kind: 'range', min: 67, max: 69 });
		expect(container.textContent).toBe('67 - 69');
		expect(container.querySelector('strong')).toBeNull();
	});

	it('bolds a dominant value equal to the min endpoint', () => {
		const container = renderCell({
			kind: 'range',
			min: 67,
			max: 69,
			dominant: 67
		});
		expect(container.textContent).toBe('67 - 69');
		expect(container.querySelector('strong')?.textContent).toBe('67');
	});

	it('bolds a dominant value equal to the max endpoint', () => {
		const container = renderCell({
			kind: 'range',
			min: 67,
			max: 69,
			dominant: 69
		});
		expect(container.textContent).toBe('67 - 69');
		expect(container.querySelector('strong')?.textContent).toBe('69');
	});

	it('appends a bold parenthesised dominant value inside the range', () => {
		const container = renderCell({
			kind: 'range',
			min: 67,
			max: 70,
			dominant: 69
		});
		expect(container.textContent).toBe('67 - 70 (69)');
		expect(container.querySelector('strong')?.textContent).toBe('(69)');
	});
});
