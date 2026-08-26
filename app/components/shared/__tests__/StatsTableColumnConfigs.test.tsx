import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
	createNameLinkCell,
	buildAgeClassColumnConfigs,
	buildSessionsColumnConfig,
	type AgeClassField
} from '../StatsTableColumnConfigs';
import type { RowModelWithRawData } from '../SortableTable';

afterEach(() => {
	cleanup();
});

describe('createNameLinkCell', () => {
	type Raw = { label: string };
	type Model = { name: string };
	type Row = RowModelWithRawData<Raw, Model>;

	const makeRow = (name: string): Row =>
		({ name, _rawRowData: { label: name } }) as Row;

	it('renders the row display name as link text using the supplied getName', () => {
		const Cell = createNameLinkCell<Raw, Model>(
			(model) => model.name,
			() => '/anywhere'
		);
		render(<Cell model={makeRow('Robin')} />);
		expect(screen.getByRole('link').textContent?.trim()).toBe('Robin');
	});

	it('builds the href using the supplied buildHref, not a hardcoded /species/ path', () => {
		const Cell = createNameLinkCell<Raw, Model>(
			(model) => model.name,
			(model) => `/summary/${model.name}`
		);
		render(<Cell model={makeRow('2024')} />);
		expect(screen.getByRole('link').getAttribute('href')).toBe('/summary/2024');
	});

	it('re-derives name and href per row across rows with different values', () => {
		const Cell = createNameLinkCell<Raw, Model>(
			(model) => model.name,
			(model) => `/summary/${model.name}`
		);
		render(
			<>
				<Cell model={makeRow('January')} />
				<Cell model={makeRow('February')} />
			</>
		);
		const links = screen.getAllByRole('link');
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			'January',
			'February'
		]);
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'/summary/January',
			'/summary/February'
		]);
	});

	it('does not break the href when the name contains characters needing URL-encoding', () => {
		const Cell = createNameLinkCell<Raw, Model>(
			(model) => model.name,
			(model) => `/species/${encodeURIComponent(model.name)}`
		);
		render(<Cell model={makeRow('Reed & Sedge')} />);
		expect(screen.getByRole('link').getAttribute('href')).toBe(
			'/species/Reed%20%26%20Sedge'
		);
	});
});

describe('buildAgeClassColumnConfigs', () => {
	// The session table's own RowModel shape (identity mapping), used to prove
	// the builder reproduces today's behaviour.
	type SessionModel = {
		new: number;
		retraps: number;
		pullus: number;
		juvs: number;
		postjuv: number;
		adults: number;
		unknownAge: number;
	};
	const sessionFieldKeys: Record<AgeClassField, keyof SessionModel> = {
		new: 'new',
		retraps: 'retraps',
		pullus: 'pullus',
		juvs: 'juvs',
		postjuv: 'postjuv',
		adults: 'adults',
		unknownAge: 'unknownAge'
	};
	const sessionLabels: Record<AgeClassField, string> = {
		new: 'New',
		retraps: 'Retrap',
		pullus: 'Pulli',
		juvs: 'Juv',
		postjuv: 'Postjuv',
		adults: 'Adult',
		unknownAge: 'Unaged'
	};

	// A second, differently-shaped caller: different RowModel key names AND
	// different header wording for the same logical fields.
	type TotalsModel = {
		freshRinged: number;
		recaptures: number;
		chicks: number;
		juveniles: number;
		moultedJuv: number;
		grownUps: number;
		ageUnknown: number;
	};
	const totalsFieldKeys: Record<AgeClassField, keyof TotalsModel> = {
		new: 'freshRinged',
		retraps: 'recaptures',
		pullus: 'chicks',
		juvs: 'juveniles',
		postjuv: 'moultedJuv',
		adults: 'grownUps',
		unknownAge: 'ageUnknown'
	};
	const totalsLabels: Record<AgeClassField, string> = {
		new: 'New',
		retraps: 'Retraps',
		pullus: 'Pulli',
		juvs: 'Juvs',
		postjuv: 'Postjuv',
		adults: 'Adult',
		unknownAge: 'Unknown age'
	};

	it('returns new/retraps/juvs/postjuv/adults/unknownAge in order when hasPullus is false', () => {
		const configs = buildAgeClassColumnConfigs<SessionModel>(
			false,
			sessionFieldKeys,
			sessionLabels
		);
		expect(Object.keys(configs)).toEqual([
			'new',
			'retraps',
			'juvs',
			'postjuv',
			'adults',
			'unknownAge'
		]);
	});

	it('inserts the pullus entry immediately before juvs when hasPullus is true', () => {
		const configs = buildAgeClassColumnConfigs<SessionModel>(
			true,
			sessionFieldKeys,
			sessionLabels
		);
		expect(Object.keys(configs)).toEqual([
			'new',
			'retraps',
			'pullus',
			'juvs',
			'postjuv',
			'adults',
			'unknownAge'
		]);
	});

	it('uses the caller-supplied label for each column', () => {
		const configs = buildAgeClassColumnConfigs<SessionModel>(
			true,
			sessionFieldKeys,
			sessionLabels
		);
		expect(configs.new?.label).toBe('New');
		expect(configs.retraps?.label).toBe('Retrap');
		expect(configs.pullus?.label).toBe('Pulli');
		expect(configs.juvs?.label).toBe('Juv');
		expect(configs.unknownAge?.label).toBe('Unaged');
	});

	it('lets two callers word the same logical field differently from the one builder', () => {
		const sessionConfigs = buildAgeClassColumnConfigs<SessionModel>(
			false,
			sessionFieldKeys,
			sessionLabels
		);
		const totalsConfigs = buildAgeClassColumnConfigs<TotalsModel>(
			false,
			totalsFieldKeys,
			totalsLabels
		);
		expect(sessionConfigs.retraps?.label).toBe('Retrap');
		expect(totalsConfigs.recaptures?.label).toBe('Retraps');
		expect(sessionConfigs.juvs?.label).toBe('Juv');
		expect(totalsConfigs.juveniles?.label).toBe('Juvs');
		expect(sessionConfigs.unknownAge?.label).toBe('Unaged');
		expect(totalsConfigs.ageUnknown?.label).toBe('Unknown age');
	});

	it('keys each config by the caller-supplied RowModel key for each logical field', () => {
		const configs = buildAgeClassColumnConfigs<TotalsModel>(
			true,
			totalsFieldKeys,
			totalsLabels
		);
		expect(Object.keys(configs)).toEqual([
			'freshRinged',
			'recaptures',
			'chicks',
			'juveniles',
			'moultedJuv',
			'grownUps',
			'ageUnknown'
		]);
	});

	it('puts the start border on pullus when shown, on juvs when hidden, and the end border always on unknownAge', () => {
		const withPullus = buildAgeClassColumnConfigs<SessionModel>(
			true,
			sessionFieldKeys,
			sessionLabels
		);
		expect(withPullus.pullus?.headerClassName).toContain('border-l-4');
		expect(withPullus.juvs?.headerClassName).not.toContain('border-l-4');
		expect(withPullus.unknownAge?.headerClassName).toContain('border-r-4');

		const withoutPullus = buildAgeClassColumnConfigs<SessionModel>(
			false,
			sessionFieldKeys,
			sessionLabels
		);
		expect(withoutPullus.juvs?.headerClassName).toContain('border-l-4');
		expect(withoutPullus.unknownAge?.headerClassName).toContain('border-r-4');
	});

	it('omits the pullus key entirely (not an empty column) when hasPullus is false', () => {
		const configs = buildAgeClassColumnConfigs<SessionModel>(
			false,
			sessionFieldKeys,
			sessionLabels
		);
		expect('pullus' in configs).toBe(false);
	});
});

describe('buildSessionsColumnConfig', () => {
	type Model = { sessions: number };

	it('returns a single-entry config keyed by the supplied field key with the supplied label', () => {
		const config = buildSessionsColumnConfig<Model>('sessions', 'Sessions');
		expect(Object.keys(config)).toEqual(['sessions']);
		expect(config.sessions?.label).toBe('Sessions');
	});

	it('is absent from a caller column-config object entirely when never called', () => {
		// A caller that opts in has the key; one that never calls the helper
		// simply composes its column configs without it.
		const optedIn = buildSessionsColumnConfig<Model>('sessions', 'Sessions');
		const optedOut: typeof optedIn = {};
		expect('sessions' in optedIn).toBe(true);
		expect('sessions' in optedOut).toBe(false);
	});
});
