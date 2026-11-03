'use client';

import { useId } from 'react';

export type AggregateByValue = 'bird' | 'encounter';

const OPTIONS: { value: AggregateByValue; label: string }[] = [
	{ value: 'bird', label: 'Bird' },
	{ value: 'encounter', label: 'Encounter' }
];

// Shared control for switching a totals table's capture-type/age-class block
// between bird-based and encounter-based counts. Stateless — the caller owns
// `value`/`onChange` and decides which derive function feeds
// `SortableTable`'s `rowDataTransform`. Mirrors the toggle-button pattern in
// `WeightAndWingChart`.
export function AggregateByToggle({
	value,
	onChange,
	disabled = false
}: {
	value: AggregateByValue;
	onChange: (value: AggregateByValue) => void;
	// When set, the toggle still renders (so its locked state stays visible) but
	// the options can't be changed — used by tabs whose aggregation is fixed.
	disabled?: boolean;
}) {
	// Scoped with useId() — multiple `PeriodTotalsTable`s can be mounted at once
	// (species page tabs stay mounted-but-hidden rather than unmounting), so a
	// static id/name would collide across instances and break the label/radio
	// association and native radio grouping.
	const instanceId = useId();
	return (
		<div className="flex items-center justify-center gap-2">
			<span>Aggregate by:</span>
			<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
				{OPTIONS.map((option) => (
					<label
						key={option.value}
						htmlFor={`${instanceId}-aggregate-by-toggle-${option.value}`}
						className={`btn btn-sm btn-text has-checked:btn-active${
							disabled ? ' btn-disabled pointer-events-none' : ''
						}`}
					>
						<span>{option.label}</span>
						<input
							id={`${instanceId}-aggregate-by-toggle-${option.value}`}
							name={`${instanceId}-aggregate-by-toggle`}
							type="radio"
							className="hidden"
							checked={value === option.value}
							disabled={disabled}
							onChange={() => onChange(option.value)}
						/>
					</label>
				))}
			</div>
		</div>
	);
}
