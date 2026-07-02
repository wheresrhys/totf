'use client';

import { useState, useRef, useCallback } from 'react';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import type { ImportMessage } from '@/app/api/import/route';

type ImportState =
	| { status: 'idle' }
	| { status: 'processing'; processed: number }
	| {
			status: 'complete';
			processed: number;
			successful: number;
			failed: number;
	  }
	| {
			status: 'timeout';
			processed: number;
			startDate: string | null;
			endDate: string | null;
	  }
	| { status: 'error'; message: string };

export default function ImportPage() {
	const [state, setState] = useState<ImportState>({ status: 'idle' });
	const [fileName, setFileName] = useState<string>('');
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setFileName(e.target.files?.[0]?.name ?? '');
		},
		[]
	);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const file = fileInputRef.current?.files?.[0];
		if (!file) return;

		setState({ status: 'processing', processed: 0 });

		const formData = new FormData();
		formData.append('csv', file);

		const response = await fetch('/api/import', {
			method: 'POST',
			body: formData
		});

		if (!response.ok || !response.body) {
			setState({ status: 'error', message: 'Upload failed' });
			return;
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop()!;
			for (const line of lines) {
				if (!line.trim()) continue;
				const message = JSON.parse(line) as ImportMessage;
				switch (message.type) {
					case 'progress':
						setState({ status: 'processing', processed: message.processed });
						break;
					case 'complete':
						setState({
							status: 'complete',
							processed: message.processed,
							successful: message.successful,
							failed: message.failed
						});
						break;
					case 'timeout':
						setState({
							status: 'timeout',
							processed: message.processed,
							startDate: message.startDate,
							endDate: message.endDate
						});
						break;
					case 'error':
						setState({ status: 'error', message: message.message });
						break;
				}
			}
		}
	}

	const isProcessing = state.status === 'processing';

	return (
		<PageWrapper>
			<PrimaryHeading>Import data</PrimaryHeading>
			<form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
				<label className="flex flex-col gap-1">
					<span className="text-sm">Upload a csv file exported from Demon</span>
					<div className="join w-full">
						<input
							type="text"
							readOnly
							value={fileName}
							placeholder="No file chosen"
							className="input input-bordered join-item flex-1 cursor-default"
							disabled={isProcessing}
						/>
						<button
							type="button"
							className="btn btn-secondary join-item"
							disabled={isProcessing}
							onClick={() => fileInputRef.current?.click()}
						>
							Browse
						</button>
					</div>
					<input
						ref={fileInputRef}
						type="file"
						accept=".csv"
						name="csv"
						className="hidden"
						onChange={handleFileChange}
						disabled={isProcessing}
					/>
				</label>
				<button
					type="submit"
					className="btn btn-primary"
					disabled={isProcessing}
				>
					Import
				</button>
			</form>

			{isProcessing && (
				<div className="mt-4 flex items-center gap-2">
					<span className="loading loading-spinner loading-sm" />
					{state.processed > 0 && <span>{state.processed} rows processed</span>}
				</div>
			)}

			{state.status === 'complete' && (
				<p className="mt-4">
					Import complete: {state.successful} rows imported successfully
					{state.failed > 0 && `, ${state.failed} failed`}.
				</p>
			)}

			{state.status === 'timeout' && (
				<div className="mt-4 flex flex-col gap-2">
					<p>
						{state.processed} rows were processed before the request timed out.
					</p>
					{state.endDate && (
						<p>
							Data up to {state.endDate} was imported. Re-export from Demon with
							records no older than this date and import again.
						</p>
					)}
				</div>
			)}

			{state.status === 'error' && (
				<p className="mt-4 text-error text-sm">{state.message}</p>
			)}
		</PageWrapper>
	);
}
