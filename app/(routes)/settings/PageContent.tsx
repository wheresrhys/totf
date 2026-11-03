'use client';
import { useState, useTransition } from 'react';
import { PageWrapper, PrimaryHeading } from '@/modules/ui-kit';
import { updatePublicSummaryEnabled } from '@/app/actions/settings';

export type SettingsPageData = {
	publicSummaryEnabled: boolean;
};

export function SettingsPageContent({ data }: { data: SettingsPageData }) {
	const [enabled, setEnabled] = useState(data.publicSummaryEnabled);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function handleToggle(event: React.ChangeEvent<HTMLInputElement>) {
		const nextEnabled = event.target.checked;
		setError(null);
		startTransition(async () => {
			const result = await updatePublicSummaryEnabled(nextEnabled);
			if (result.success) {
				setEnabled(result.enabled);
			} else {
				setError(result.error);
			}
		});
	}

	return (
		<PageWrapper>
			<PrimaryHeading>Settings</PrimaryHeading>
			<div className="flex items-center gap-2">
				<label htmlFor="public-summary-checkbox" className="shrink-0">
					Make my summary pages public
				</label>
				<input
					id="public-summary-checkbox"
					type="checkbox"
					className="checkbox"
					checked={enabled}
					onChange={handleToggle}
					disabled={isPending}
				/>
			</div>
			{error && (
				<p role="alert" className="text-error text-sm mt-2">
					{error}
				</p>
			)}
		</PageWrapper>
	);
}
