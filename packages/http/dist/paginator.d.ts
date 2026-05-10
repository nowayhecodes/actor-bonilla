import type { HttpResponse, PaginationOptions } from './types.js';
/**
 * Builds a `paginate` function from a Next-URL extractor.
 * Works with APIs that return the next page URL in a response field.
 *
 * @example
 * ```typescript
 * const paginate = paginateByNextUrl((resp) => (resp.body as any).next);
 * ```
 */
export declare function paginateByNextUrl<T = unknown>(getNextUrl: (response: HttpResponse) => string | null | undefined): NonNullable<PaginationOptions<T>['paginate']>;
/**
 * Builds a `paginate` function for offset-based pagination.
 *
 * @param pageSize  Items per page.
 * @param getOffset Function that derives the current offset from the response.
 * @param totalField Optional response body field name holding the total count.
 *
 * @example
 * ```typescript
 * const paginate = paginateByOffset(20, (resp) => (resp.body as any).offset);
 * ```
 */
export declare function paginateByOffset<T = unknown>(pageSize: number, getOffset: (response: HttpResponse) => number, totalField?: string): NonNullable<PaginationOptions<T>['paginate']>;
/**
 * Builds a `paginate` function for page-number-based pagination.
 *
 * @param pageSize   Items per page.
 * @param pageParam  Query-string key for the page number (default 'page').
 *
 * @example
 * ```typescript
 * const paginate = paginateByPage(25);
 * ```
 */
export declare function paginateByPage<T = unknown>(pageSize: number, pageParam?: string): NonNullable<PaginationOptions<T>['paginate']>;
/**
 * Builds a `paginate` function for Link-header-based pagination (GitHub style).
 *
 * @example
 * ```typescript
 * const paginate = paginateByLinkHeader();
 * ```
 */
export declare function paginateByLinkHeader<T = unknown>(): NonNullable<PaginationOptions<T>['paginate']>;
/**
 * Builds a `paginate` function for cursor-based pagination.
 *
 * @param getCursor Function extracting the next cursor from a response.
 * @param cursorParam Query-string key (default 'cursor').
 *
 * @example
 * ```typescript
 * const paginate = paginateByCursor((resp) => (resp.body as any).next_cursor);
 * ```
 */
export declare function paginateByCursor<T = unknown>(getCursor: (response: HttpResponse) => string | null | undefined, cursorParam?: string): NonNullable<PaginationOptions<T>['paginate']>;
