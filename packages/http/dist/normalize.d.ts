import type { Options, NormalizedOptions } from './types.js';
export declare function resolveUrl(url: string | URL, prefixUrl?: string | URL): URL;
export declare function applySearchParams(url: URL, searchParams: Options['searchParams']): URL;
export declare function mergeHeaders(...parts: (HeadersInit | Headers | undefined)[]): Headers;
export declare function normalizeOptions(base: Partial<Options>, override?: Partial<Options>): NormalizedOptions;
/** Deep-merge two option objects (headers merged, hook arrays concatenated). */
export declare function mergeOptionObjects(a: Partial<Options>, b: Partial<Options>): Partial<Options>;
