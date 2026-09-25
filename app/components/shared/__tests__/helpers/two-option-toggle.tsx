import type { ReactElement } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

/**
 * Shared behaviour contract for the app's "two-option button-pair" toggle
 * components (`AggregateByToggle`, `CombineYearsToggle`, `EmptyMonthsToggle`):
 * a label, two radios rendered from `options`, checked-state driven by
 * `value`, and `onChange` called with the clicked option's value. The three
 * components' prop shapes differ (string-union vs boolean value, and
 * `AggregateByToggle` alone takes a `disabled` prop), so this is a shared
 * *test* runner rather than a single merged `it.each` table — call it once
 * per component, passing a `renderToggle` adapter that maps the generic
 * `{value, onChange}` pair onto that component's actual props.
 */
export function testTwoOptionToggle<const TValue>({
	name,
	renderToggle,
	labelText,
	options
}: {
	name: string;
	renderToggle: (props: {
		value: TValue;
		onChange: (value: TValue) => void;
	}) => ReactElement;
	labelText: string;
	options: readonly [
		{ value: TValue; label: string },
		{ value: TValue; label: string }
	];
}) {
	const [first, second] = options;

	describe(name, () => {
		afterEach(() => {
			cleanup();
		});

		describe('usual', () => {
			it(`renders the "${labelText}" label and ${first.label}/${second.label} radios`, () => {
				render(renderToggle({ value: first.value, onChange: () => {} }));
				expect(screen.getByText(labelText)).not.toBeNull();
				expect(screen.getByRole('radio', { name: first.label })).toBeInstanceOf(
					HTMLInputElement
				);
				expect(
					screen.getByRole('radio', { name: second.label })
				).toBeInstanceOf(HTMLInputElement);
			});

			it('calls onChange with the corresponding value when a radio is clicked', () => {
				const onChange = vi.fn();
				render(renderToggle({ value: first.value, onChange }));
				fireEvent.click(screen.getByRole('radio', { name: second.label }));
				expect(onChange).toHaveBeenCalledWith(second.value);
			});
		});

		describe('structure', () => {
			it(`checks the ${first.label} radio when value is ${JSON.stringify(first.value)}`, () => {
				render(renderToggle({ value: first.value, onChange: () => {} }));
				expect(screen.getByRole('radio', { name: first.label })).toHaveProperty(
					'checked',
					true
				);
				expect(
					screen.getByRole('radio', { name: second.label })
				).toHaveProperty('checked', false);
			});

			it(`checks the ${second.label} radio when value is ${JSON.stringify(second.value)}`, () => {
				render(renderToggle({ value: second.value, onChange: () => {} }));
				expect(
					screen.getByRole('radio', { name: second.label })
				).toHaveProperty('checked', true);
				expect(screen.getByRole('radio', { name: first.label })).toHaveProperty(
					'checked',
					false
				);
			});
		});
	});
}
