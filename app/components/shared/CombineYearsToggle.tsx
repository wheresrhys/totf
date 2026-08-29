'use client';

const OPTIONS: { value: boolean; label: string }[] = [
	{ value: true, label: 'Combined' },
	{ value: false, label: 'By year' }
];

// Shared control for the all-time "Month totals" tab's combine-years mode.
// ON (`true`) sums each calendar month across every year into a single row;
// OFF (`false`) shows one row per `(year, month)` combination instead.
// Stateless — the caller owns `value`/`onChange`. Mirrors `AggregateByToggle`'s
// button-pair pattern.
export function CombineYearsToggle({
	value,
	onChange
}: {
	value: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-center gap-2">
			<span>Combine years:</span>
			<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
				{OPTIONS.map((option) => (
					<label
						key={String(option.value)}
						htmlFor={`combine-years-toggle-${option.value}`}
						className="btn btn-sm btn-text has-checked:btn-active"
					>
						<span>{option.label}</span>
						<input
							id={`combine-years-toggle-${option.value}`}
							name="combine-years-toggle"
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
