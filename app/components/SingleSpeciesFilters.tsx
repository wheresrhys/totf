function Switch({
	label,
	id,
	checked,
	onChange
}: {
	label: string;
	id: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-center gap-1">
			<input
				type="checkbox"
				className="switch"
				id={id}
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<label className="label-text text-base" htmlFor={id}>
				{label}
			</label>
		</div>
	);
}

export function SingleSpeciesFilters({
	retrappedOnly,
	setRetrappedOnly,
	sexedOnly,
	setSexedOnly,
	setShowWeightVsWingChart,
	showWeightVsWingChart,
	setShowStatsHistory,
	showStatsHistory,
	showNotableRetraps,
	setShowNotableRetraps
}: {
	retrappedOnly: boolean;
	setRetrappedOnly: (retrappedOnly: boolean) => void;
	sexedOnly: boolean;
	setSexedOnly: (sexedOnly: boolean) => void;
	setShowWeightVsWingChart: (showWeightVsWingChart: boolean) => void;
	showWeightVsWingChart: boolean;
	setShowStatsHistory: (showStatsHistory: boolean) => void;
	showStatsHistory: boolean;
	showNotableRetraps: boolean;
	setShowNotableRetraps: (showNotableRetraps: boolean) => void;
}) {
	return (
		<form className="mt-7 flex justify-end gap-2 flex-wrap">
			{showNotableRetraps ? null : (
				<button
					type="button"
					className="btn btn-secondary btn-sm"
					onClick={() => setShowNotableRetraps(true)}
				>
					Notable retraps
				</button>
			)}
			{showStatsHistory ? null : (
				<button
					type="button"
					className="btn btn-secondary btn-sm"
					onClick={() => setShowStatsHistory(true)}
				>
					Stats history
				</button>
			)}
			{showWeightVsWingChart ? null : (
				<button
					type="button"
					className="btn btn-secondary btn-sm"
					onClick={() => setShowWeightVsWingChart(true)}
				>
					Size plot
				</button>
			)}
			<Switch
				label="List retrapped only"
				id="retrapped-only"
				checked={retrappedOnly}
				onChange={setRetrappedOnly}
			/>
			<Switch
				label="List sexed only"
				id="sexed-only"
				checked={sexedOnly}
				onChange={setSexedOnly}
			/>
		</form>
	);
}
