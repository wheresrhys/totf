'use client';

const OPTIONS: { value: boolean; label: string }[] = [
	{ value: false, label: 'Show' },
	{ value: true, label: 'Hide' }
];

// Shared control for the Session-totals tab's "Empty sessions:" mode. ON
// (`true`, the default) hides the zero-count session rows
// `SimpleStatsCacheBySpecies`'s day-grain spine zero-fills in for a session
// day the filtered species wasn't encountered; OFF (`false`) shows every row
// exactly as before. Stateless — the caller owns `value`/`onChange`. Mirrors
// `EmptyMonthsToggle`'s button-pair pattern exactly.
export function EmptySessionsToggle({
	value,
	onChange
}: {
	value: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-center gap-2">
			<span>Empty sessions:</span>
			<div className="border-base-content/20 flex gap-0.5 rounded-field border p-0.5">
				{OPTIONS.map((option) => (
					<label
						key={String(option.value)}
						htmlFor={`empty-sessions-toggle-${option.value}`}
						className="btn btn-sm btn-text has-checked:btn-active"
					>
						<span>{option.label}</span>
						<input
							id={`empty-sessions-toggle-${option.value}`}
							name="empty-sessions-toggle"
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
