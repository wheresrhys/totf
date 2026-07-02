import { SignJWT, jwtVerify } from 'jose';

function getEncodedSecret(): Uint8Array {
	const secret = process.env.SUPABASE_JWT_SECRET;
	if (!secret) {
		throw new Error('SUPABASE_JWT_SECRET environment variable is not set');
	}
	return new TextEncoder().encode(secret);
}

export async function generateGroupJwt(groupId: number): Promise<string> {
	return new SignJWT({
		role: 'authenticated',
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
