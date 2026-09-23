import type { HighlightsGenerator } from './types';
import { birdCount } from './counts/bird-count';

export const highlightRules: HighlightsGenerator[] = [birdCount];
