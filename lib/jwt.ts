import { SignJWT, jwtVerify } from 'jose';

// Fail closed: every environment must state which role it signs JWTs with.
// authenticated = normal read/write access (RLS-scoped); app_readonly = writes
// rejected by Postgres (see supabase/schema/cluster/roles.sql).
const ALLOWED_JWT_ROLES = ['authenticated', 'app_readonly'];

function getJwtRole(): string {
	const role = process.env.SUPABASE_JWT_ROLE;
	if (!role) {
		throw new Error('SUPABASE_JWT_ROLE environment variable is not set');
	}
	if (!ALLOWED_JWT_ROLES.includes(role)) {
		throw new Error(
			`Unrecognised SUPABASE_JWT_ROLE "${role}" — expected one of: ${ALLOWED_JWT_ROLES.join(', ')}`
		);
	}
	return role;
}

function getEncodedSecret(): Uint8Array {
	const secret = process.env.SUPABASE_JWT_SECRET;
	if (!secret) {
		throw new Error('SUPABASE_JWT_SECRET environment variable is not set');
	}
	return new TextEncoder().encode(secret);
}

export async function generateGroupJwt(groupId: number): Promise<string> {
	return new SignJWT({
		role: getJwtRole(),
		app_metadata: { ringing_group_id: groupId }
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('1y')
		.sign(getEncodedSecret());
}

export async function verifyGroupJwt(token: string): Promise<number | null> {
	try {
		const { payload } = await jwtVerify(token, getEncodedSecret());
		const groupId = (payload.app_metadata as { ringing_group_id?: number })
			?.ringing_group_id;
		return typeof groupId === 'number' ? groupId : null;
	} catch {
		return null;
	}
}
