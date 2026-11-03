'use client';

const OPTIONS: { value: boolean; label: string }[] = [
	{ value: false, label: 'Show' },
	{ value: true, label: 'Hide' }
];

// Shared control for a month-totals table's "Empty months:" mode. ON (`true`)
// hides the synthetic zero-session calendar months a month-totals table
// zero-fills in; OFF (`false`, the default everywhere) keeps all months showing,
// preserving today's baseline. Stateless — the caller owns `value`/`onChange`.
// Mirrors `CombineYearsToggle`'s button-pair pattern exactly.
export function EmptyMonthsToggle({
	value,
	onChange
}: {
	value: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-center gap-2">
			<span>Empty months:</span>
			<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
				{OPTIONS.map((option) => (
					<label
						key={String(option.value)}
						htmlFor={`empty-months-toggle-${option.value}`}
						className="btn btn-sm btn-text has-checked:btn-active"
					>
						<span>{option.label}</span>
						<input
							id={`empty-months-toggle-${option.value}`}
							name="empty-months-toggle"
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
