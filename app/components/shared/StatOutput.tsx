import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';
import { format as formatDate } from 'date-fns';
import type { LocationRow } from '@/app/models/db';
import { printLocationName } from './DesignSystem';
export type TemporalUnit = 'day' | 'month' | 'year';
export type StatOutputModel = {
	value: number;
	speciesName?: string;
	visitDate: string;
	showUnit?: boolean;
	unit?: string;
	temporalUnit: TemporalUnit;
	dateFormat?: string;
	classes?: string;
	location?: LocationRow;
};

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
	location
}: StatOutputModel) {
	return (
		<span className={classes}>
			<span className="font-bold">
				{value} {speciesName || (showUnit ? ` ${unit}` : '')}
			</span>{' '}
			{connectingVerbMap[temporalUnit as TemporalUnit] as string}{' '}
			{temporalUnit === 'day' ? (
				<NoPrefetchLink
					className="link"
					href={`/session/${visitDate}${location ? `/loc-${location.id}` : ''}`}
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
