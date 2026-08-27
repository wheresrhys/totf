'use client';

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
	onChange
}: {
	value: AggregateByValue;
	onChange: (value: AggregateByValue) => void;
}) {
	return (
		<div className="flex items-center justify-center gap-2">
			<span>Aggregate by:</span>
			<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
				{OPTIONS.map((option) => (
					<label
						key={option.value}
						htmlFor={`aggregate-by-toggle-${option.value}`}
						className="btn btn-sm btn-text has-checked:btn-active"
					>
						<span>{option.label}</span>
						<input
							id={`aggregate-by-toggle-${option.value}`}
							name="aggregate-by-toggle"
							type="radio"
							className="hidden"
							checked={value === option.value}
							onChange={() => onChange(option.value)}
						/>
					</label>
				))}
			</div>
		</div>
	);
}
