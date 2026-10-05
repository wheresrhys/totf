'use client';
import { useState, useEffect, useActionState } from 'react';
import {
	fetchGroupLocations,
	resolveUnrecognisedLocations,
	type GroupLocationRow,
	type ResolveUnrecognisedLocationsState,
	type LocationDecision
} from '@/app/actions/locations';
import type { ViewedGroup } from '@/app/lib/group-slug';

type RowState =
	| { kind: 'new' }
	| { kind: 'rename'; existingLocationId: number | null };

// Review screen for #1079's `unrecognised_locations` import abort: for each
// CSV location name this group has no `Locations` row for, the group says
// whether it's a genuinely new ringing site ("new location", the default) or
// a renamed existing one ("rename", picked from the group's current
// Locations, fetched on mount). Mirrors `CreateSequenceFromPrefix.tsx`'s
// confirm pattern (`useActionState` form, hidden inputs, pending spinner,
// inline error that keeps the review open) but as an inline section rather
// than an overlay modal, since it replaces a plain notice already inline in
// the import flow (`app/(routes)/import/PageContent.tsx`). The whole
// decisions array is serialised into a single hidden `decisions` field —
// FormData has no native array-of-objects support — and parsed/validated
// server-side by `resolveUnrecognisedLocations` before any write happens.
export function UnrecognisedLocationsReview({
	names,
	viewedGroup,
	onResolved
}: {
	names: string[];
	viewedGroup: ViewedGroup;
	onResolved: () => void;
}) {
	const [locations, setLocations] = useState<GroupLocationRow[] | null>(null);
	const [rowStates, setRowStates] = useState<Record<string, RowState>>(() =>
		Object.fromEntries(names.map((name) => [name, { kind: 'new' } as RowState]))
	);
	const [state, action, isPending] = useActionState<
		ResolveUnrecognisedLocationsState,
		FormData
	>(resolveUnrecognisedLocations, null);

	useEffect(() => {
		let cancelled = false;
		fetchGroupLocations(viewedGroup).then((rows) => {
			if (!cancelled) setLocations(rows ?? []);
		});
		return () => {
			cancelled = true;
		};
	}, [viewedGroup]);

	useEffect(() => {
		if (state?.success) {
			onResolved();
		}
	}, [state, onResolved]);

	function setKind(name: string, kind: RowState['kind']) {
		setRowStates((prev) => ({
			...prev,
			[name]:
				kind === 'new'
					? { kind: 'new' }
					: {
							kind: 'rename',
							existingLocationId:
								prev[name]?.kind === 'rename'
									? prev[name].existingLocationId
									: null
						}
		}));
	}

	function setExistingLocationId(name: string, existingLocationId: number) {
		setRowStates((prev) => ({
			...prev,
			[name]: { kind: 'rename', existingLocationId }
		}));
	}

	const decisions: LocationDecision[] = names.map((name) => {
		const rowState = rowStates[name];
		if (rowState?.kind === 'rename' && rowState.existingLocationId != null) {
			return {
				name,
				kind: 'rename',
				existingLocationId: rowState.existingLocationId
			};
		}
		return { name, kind: 'new' };
	});

	if (locations === null) {
		return (
			<div
				className="mt-4 flex items-center gap-2"
				data-testid="unrecognised-locations-loading"
			>
				<span className="loading loading-spinner loading-sm" />
				<span>Loading locations…</span>
			</div>
		);
	}

	return (
		<div
			className="mt-4 flex flex-col gap-4 max-w-md"
			data-testid="unrecognised-locations-review"
		>
			<p>
				Import aborted — these locations were not recognised. For each one, say
				whether it is a genuinely new site or a rename of an existing one, then
				re-import your file.
			</p>
			<form action={action} className="flex flex-col gap-4">
				<input type="hidden" name="viewed_group_id" value={viewedGroup.id} />
				<input
					type="hidden"
					name="decisions"
					value={JSON.stringify(decisions)}
					readOnly
				/>
				<ul
					className="flex flex-col gap-3"
					data-testid="unrecognised-locations-list"
				>
					{names.map((name) => {
						const rowState = rowStates[name] ?? { kind: 'new' };
						const isRename = rowState.kind === 'rename';
						return (
							<li
								key={name}
								className="flex flex-col gap-1"
								data-testid={`unrecognised-location-row-${name}`}
							>
								<span className="font-bold">{name}</span>
								<div className="flex items-center gap-4">
									<label className="flex items-center gap-1">
										<input
											type="radio"
											name={`kind-${name}`}
											checked={!isRename}
											onChange={() => setKind(name, 'new')}
										/>
										New location
									</label>
									<label className="flex items-center gap-1">
										<input
											type="radio"
											name={`kind-${name}`}
											checked={isRename}
											onChange={() => setKind(name, 'rename')}
										/>
										Rename of an existing location
									</label>
								</div>
								{isRename && (
									<select
										className="select select-bordered"
										aria-label={`Existing location for ${name}`}
										value={
											rowState.kind === 'rename' &&
											rowState.existingLocationId != null
												? rowState.existingLocationId
												: ''
										}
										onChange={(e) =>
											setExistingLocationId(name, Number(e.target.value))
										}
									>
										<option value="" disabled>
											Select existing location
										</option>
										{locations.map((location) => (
											<option key={location.id} value={location.id}>
												{location.location_name}
											</option>
										))}
									</select>
								)}
							</li>
						);
					})}
				</ul>
				{state && !state.success && (
					<p className="text-error text-sm">{state.error}</p>
				)}
				<div className="flex justify-end">
					<button
						type="submit"
						className="btn btn-primary"
						disabled={isPending}
					>
						{isPending ? (
							<span className="loading loading-spinner loading-sm" />
						) : (
							'Save and continue'
						)}
					</button>
				</div>
			</form>
		</div>
	);
}
