import { DiscrepenciesResult } from '@/app/models/db';
import { supabase, catchSupabaseErrors } from '@/lib/supabase';
import { BootstrapPageData } from '@/app/components/layout/BootstrapPageData';
import {
	PageWrapper,
	PrimaryHeading
} from '@/app/components/shared/DesignSystem';
import { MistakesTable } from '@/app/components/MistakesTable';

export async function fetchMistakes(): Promise<DiscrepenciesResult[]> {
	return supabase
		.rpc('find_discrepencies')
		.then(catchSupabaseErrors) as Promise<DiscrepenciesResult[]>;
}

function ListMistakes({ data }: { data: DiscrepenciesResult[] }) {
	return (
		<PageWrapper>
			<PrimaryHeading>Mistakes</PrimaryHeading>
			<MistakesTable mistakes={data} />
		</PageWrapper>
	);
}
export default async function MistakesPage() {
	return (
		<BootstrapPageData<DiscrepenciesResult[]>
			getCacheKeys={() => ['mistakes']}
			dataFetcher={fetchMistakes}
			PageComponent={ListMistakes}
		/>
	);
}
