'use client';
import { PageWrapper } from '@/app/components/shared/DesignSystem';
import { speciesStatConfigs } from '@/app/models/species-stats';
import type { SpeciesStatsRow } from '@/app/models/db';
import type { PageData } from '@/app/(routes)/species/page';
import { useState, useEffect, useRef } from 'react';
import { fetchSpeciesData } from '@/app/actions/multi-species-data';
import {
	SortableTable,
	type ColumnConfig
} from '@/app/components/shared/SortableTable';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';

function MultiSpeciesTableBody({ data }: { data: SpeciesStatsRow[] }) {
	return (
		<tbody>
			{data.map((species) => (
				<tr key={species.species_name}>
					{speciesStatConfigs.map((column) =>
						column.property === 'species_name' ? (
							<td key={column.property}>
								<NoPrefetchLink
									className="link text-wrap"
									href={`/species/${species.species_name}`}
								>
									{species.species_name}
								</NoPrefetchLink>
							</td>
						) : (
							<td key={column.property}>{species[column.property]}</td>
						)
					)}
				</tr>
			))}
		</tbody>
	);
}

const sortableColumnConfigs = speciesStatConfigs.reduce(
	(acc, column) => ({
		...acc,
		[column.property]: {
			label: column.label,
			invertSort: column.invertSort
		}
	}),
	{} as Record<keyof SpeciesStatsRow, ColumnConfig>
);

export function MultiSpeciesStatsTable({
	data: { speciesStats: initialSpeciesStats, years }
}: {
	data: PageData;
}) {
	const formRef = useRef<HTMLFormElement>(null);
	const [year, setYear] = useState<number | null>(null);
	const [cesOnly, setCesOnly] = useState<boolean>(false);
	const [fromDate, setFromDate] = useState<string | null>(null);
	const [toDate, setToDate] = useState<string | null>(null);
	const [speciesStats, setSpeciesStats] =
		useState<SpeciesStatsRow[]>(initialSpeciesStats);
	useEffect(() => {
		fetchSpeciesData(fromDate ?? undefined, toDate ?? undefined).then(
			setSpeciesStats
		);
	}, [fromDate, toDate]);

	function clearSettings() {
		setYear(null);
		setCesOnly(false);
	}

	function clearDates() {
		setFromDate(null);
		setToDate(null);
	}

	function setDatesFromSettings({
		year,
		cesOnly
	}: {
		year: number | null;
		cesOnly: boolean;
	}) {
		if (year) {
			setFromDate(`${year.toString()}-${cesOnly ? '04-25' : '01-01'}`);
			setToDate(`${year.toString()}-${cesOnly ? '09-05' : '12-31'}`);
		} else {
			clearDates();
		}
	}

	function handleYearSelect(event: React.ChangeEvent<HTMLSelectElement>) {
		const year = parseInt(event.target.value) || null;
		setYear(year);
		setDatesFromSettings({ year, cesOnly });
	}

	function handleCesOnlyChange(event: React.ChangeEvent<HTMLInputElement>) {
		const cesOnly = event.target.checked;
		setCesOnly(cesOnly);
		setDatesFromSettings({ year, cesOnly });
	}

	function handleDateChange(event: React.ChangeEvent<HTMLInputElement>) {
		const value = event.target.value;
		const inputType = event.target.id.split('-')[0];
		clearSettings();
		if (inputType === 'from') {
			setFromDate(value);
		} else {
			setToDate(value);
		}
	}

	return (
		<>
			<PageWrapper>
				<form ref={formRef} className="flex gap-2 flex-wrap justify-end">
					<div className="flex gap-2">
						<div className="flex items-center gap-2">
							<label htmlFor="year-select" className="shrink-0">
								Year
							</label>
							<select
								id="year-select"
								className="select max-w-sm appearance-none"
								aria-label="select"
								onChange={handleYearSelect}
								value={year ?? ''}
							>
								<option value="">All</option>
								{years.map((year) => (
									<option key={year} value={year}>
										{year}
									</option>
								))}
							</select>
						</div>
						<div className="flex items-center gap-2">
							<label
								htmlFor="ces-only-checkbox"
								className={`shrink-0 ${!year ? 'text-gray-400' : ''}`}
							>
								CES only
							</label>
							<input
								id="ces-only-checkbox"
								type="checkbox"
								className="checkbox"
								onChange={handleCesOnlyChange}
								checked={cesOnly}
								disabled={!year}
							/>
						</div>
					</div>
					<div className="flex gap-2 flex-wrap justify-end">
						<div className="flex items-center gap-2">
							<label htmlFor="from-date-input" className="shrink-0">
								From date
							</label>
							<input
								id="from-date-input"
								type="date"
								className="input max-w-sm"
								onChange={handleDateChange}
								value={fromDate ?? ''}
							/>
						</div>
						<div className="flex items-center gap-2">
							<label htmlFor="to-date-input" className="shrink-0">
								To date
							</label>
							<input
								id="to-date-input"
								type="date"
								className="input max-w-sm"
								onChange={handleDateChange}
								value={toDate ?? ''}
							/>
						</div>
					</div>
				</form>
			</PageWrapper>
			<SortableTable<SpeciesStatsRow, SpeciesStatsRow>
				columnConfigs={sortableColumnConfigs}
				data={speciesStats}
				rowDataTransform={(data) => data}
				TableBodyComponent={MultiSpeciesTableBody}
			/>
		</>
	);
}
