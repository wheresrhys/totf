import { format } from 'date-fns';
import { PrimaryHeading } from '@/app/components/shared/DesignSystem';
import { NoPrefetchLink } from '@/app/components/shared/NoPrefetchLink';

export function buildSpeciesHeadingText(
	speciesName: string,
	year?: number,
	month?: number
): string {
	if (year === undefined) {
		return speciesName;
	}
	if (month === undefined) {
		return `${speciesName} ${year}`;
	}
	const monthDate = new Date(year, month - 1, 1);
	return `${speciesName} ${format(monthDate, 'LLLL')} ${year}`;
}

// Period-aware heading shared by the all-time, year and year+month species routes.
// When a period is in play it appends an "All time" link back to the unscoped
// `/species/{name}` page (mirroring #614's `{species} {period} [All time]` spec);
// with no period it renders the bare species name, matching today's behaviour.
export function SpeciesHeading({
	speciesName,
	year,
	month
}: {
	speciesName: string;
	year?: number;
	month?: number;
}) {
	return (
		<PrimaryHeading>
			{buildSpeciesHeadingText(speciesName, year, month)}
			{year !== undefined && (
				<>
					{' '}
					<NoPrefetchLink
						className="link text-lg align-middle"
						href={`/species/${speciesName}`}
					>
						All time
					</NoPrefetchLink>
				</>
			)}
		</PrimaryHeading>
	);
}
