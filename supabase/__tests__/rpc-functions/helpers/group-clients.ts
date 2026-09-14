import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClientForGroup } from '../../../../app/lib/auth/group-auth';
import { getGroupIdByName } from './seed-lookups';

export interface AlphaBetaGammaClients {
	alphaId: number;
	betaId: number;
	gammaId: number;
	alphaClient: SupabaseClient;
	betaClient: SupabaseClient;
	gammaClient: SupabaseClient;
}

// Resolves the seed-data Alpha/Beta/Gamma group ids and their group-authenticated
// clients — the shared fixture most RPC integration tests build their `beforeAll` on.
export async function resolveAlphaBetaGammaClients(): Promise<AlphaBetaGammaClients> {
	const alphaId = await getGroupIdByName('Alpha');
	const betaId = await getGroupIdByName('Beta');
	const gammaId = await getGroupIdByName('Gamma');

	const [alphaClient, betaClient, gammaClient] = await Promise.all([
		getAuthenticatedSupabaseClientForGroup(alphaId),
		getAuthenticatedSupabaseClientForGroup(betaId),
		getAuthenticatedSupabaseClientForGroup(gammaId)
	]);

	return { alphaId, betaId, gammaId, alphaClient, betaClient, gammaClient };
}
