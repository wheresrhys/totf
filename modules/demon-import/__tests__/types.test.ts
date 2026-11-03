import { describe, it, expect } from 'vitest';
import { RESIGHTING_RECORD_TYPES } from '../types';

describe('RESIGHTING_RECORD_TYPES', () => {
	// Exhaustiveness guard against the public.resighting_record_type enum
	// (#874) — mirrors RING_SIZE_ENUM_ORDER's pinning test for the ring_size
	// enum (app/models/__tests__/ring-sequences.test.ts). A DB-side rename or
	// addition to the enum won't fail this test automatically (there's no
	// runtime link to the DB here), but this is the single by-hand place to
	// update alongside a schema change, per the comment above the constant.
	it('lists exactly the 3 resighting_record_type enum values', () => {
		expect(RESIGHTING_RECORD_TYPES).toHaveLength(3);
		expect(RESIGHTING_RECORD_TYPES).toEqual(['U', 'F', 'D']);
	});
});
