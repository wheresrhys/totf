import { describe, it, expect } from 'vitest';
import { findUnusedRings } from '../ring-sequences';

describe('findUnusedRings', () => {
	it('returns empty array when no gaps exist', () => {
		const rings = ['ARW000001', 'ARW000002', 'ARW000003'];
		expect(findUnusedRings(rings, 3)).toEqual([]);
	});

	it('returns missing ring numbers between min and max suffix', () => {
		const rings = ['ARW000001', 'ARW000003', 'ARW000005'];
		expect(findUnusedRings(rings, 3)).toEqual(['ARW000002', 'ARW000004']);
	});

	it('pads suffix with leading zeros to match original ring length', () => {
		const rings = ['ARW000001', 'ARW000010'];
		const unused = findUnusedRings(rings, 3);
		expect(unused).toContain('ARW000002');
		expect(unused).toContain('ARW000009');
		expect(unused[0]).toHaveLength(9);
	});

	it('returns empty array for a single ring', () => {
		expect(findUnusedRings(['ARW000001'], 3)).toEqual([]);
	});

	it('returns empty array when input is empty', () => {
		expect(findUnusedRings([], 3)).toEqual([]);
	});
});
