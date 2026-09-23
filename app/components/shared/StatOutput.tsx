import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { format as formatDate } from 'date-fns';
import type { LocationRow } from '@/app/models/db';
import type { ViewedGroup } from '@/app/lib/group-slug';
import { buildGroupSessionHref } from '@/app/lib/group-links';
import { printLocationName } from './DesignSystem';
export type TemporalUnit = 'day' | 'month' | 'year';
export type StatUnit = 'bird' | 'species' | 'encounter' | 'session';
export type StatOutputModel = {
	value: number;
	speciesName?: string;
	visitDate: string;
	showUnit?: boolean;
	unit?: StatUnit;
	temporalUnit: TemporalUnit;
	dateFormat?: string;
	classes?: string;
	location?: LocationRow;
	viewedGroup?: ViewedGroup;
	link?: boolean;
};

const plurals: Partial<Record<StatUnit | TemporalUnit, string>> = {
	species: 'species'
};

export function getPlural(unit: StatUnit | TemporalUnit | undefined): string {
	if (!unit) return '';
	return unit in plurals ? (plurals[unit] as string) : `${unit}s`;
}

const connectingVerbMap: Record<TemporalUnit, 'in' | 'on'> = {
	day: 'on',
	month: 'in',
	year: 'in'
};

const dateFormatMap: Record<TemporalUnit, string> = {
	day: 'dd MMMM yyyy',
	month: 'MMMM yyyy',
	year: 'yyyy'
};

export function StatOutput({
	dateFormat,
	unit,
	value,
	speciesName,
	visitDate,
	showUnit,
	temporalUnit,
	classes,
	location,
	viewedGroup,
	link = true
}: StatOutputModel) {
	if (temporalUnit === 'day' && !viewedGroup) {
		throw new Error(
			'viewedGroup is required to output stats for day temporal unit'
		);
	}
	return (
		<span className={classes}>
			<span className="font-bold">
				{value}{' '}
				{speciesName ||
					(showUnit ? ` ${value > 1 ? getPlural(unit) : unit}` : '')}
			</span>{' '}
			{connectingVerbMap[temporalUnit as TemporalUnit] as string}{' '}
			{temporalUnit === 'day' && link ? (
				<NoPrefetchLink
					className="link"
					href={`${buildGroupSessionHref(viewedGroup, visitDate)}${location ? `/site/${location.id}` : ''}`}
				>
					{formatDate(
						new Date(visitDate as string),
						dateFormat || dateFormatMap[temporalUnit as TemporalUnit]
					)}
				</NoPrefetchLink>
			) : (
				formatDate(
					new Date(visitDate as string),
					dateFormat || dateFormatMap[temporalUnit as TemporalUnit]
				)
			)}
			{location ? ` at ${printLocationName(location.location_name)}` : ''}
		</span>
	);
}
