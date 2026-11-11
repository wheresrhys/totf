'use client';

import { useId } from 'react';

const OPTIONS: { value: boolean; label: string }[] = [
	{ value: false, label: 'Counts' },
	{ value: true, label: 'Biometrics' }
];

// Shared control for switching a stats table's per-species breakdown block
// between age-bucket counts (`false`, today's default everywhere) and
// wing/weight biometrics (`true`). Stateless — the caller owns
// `value`/`onChange`, same as `CombineYearsToggle`/`EmptyMonthsToggle`. Scoped
// with useId() like `AggregateByToggle` rather than a static id: every table
// this wires into (the sibling wiring tickets for SpeciesTotalsTable,
// SessionSpeciesTotalsTable and PeriodTotalsTable) can have multiple
// instances mounted at once, since their tab panels stay mounted-but-hidden
// rather than unmounting.
export function CountsBiometricsToggle({
	value,
	onChange
}: {
	value: boolean;
	onChange: (value: boolean) => void;
}) {
	const instanceId = useId();
	return (
		<div className="flex items-center justify-center gap-2">
			<span>Columns:</span>
			<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
				{OPTIONS.map((option) => (
					<label
						key={String(option.value)}
						htmlFor={`${instanceId}-counts-biometrics-toggle-${option.value}`}
						className="btn btn-sm btn-text has-checked:btn-active"
					>
						<span>{option.label}</span>
						<input
							id={`${instanceId}-counts-biometrics-toggle-${option.value}`}
							name={`${instanceId}-counts-biometrics-toggle`}
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
