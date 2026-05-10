// ============================================================================
// @actor-bonilla/http — Pagination utilities
// ============================================================================

import type { HttpResponse, PaginationOptions } from './types.js';

// ─── Common pagination patterns ───────────────────────────────────────────────

/**
 * Builds a `paginate` function from a Next-URL extractor.
 * Works with APIs that return the next page URL in a response field.
 *
 * @example
 * ```typescript
 * const paginate = paginateByNextUrl((resp) => (resp.body as any).next);
 * ```
 */
export function paginateByNextUrl<T = unknown>(
  getNextUrl: (response: HttpResponse) => string | null | undefined
): NonNullable<PaginationOptions<T>['paginate']> {
  return (response) => {
    const nextUrl = getNextUrl(response);
    if (!nextUrl) return false;
    return { url: nextUrl };
  };
}

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
export function paginateByOffset<T = unknown>(
  pageSize: number,
  getOffset: (response: HttpResponse) => number,
  totalField = 'total'
): NonNullable<PaginationOptions<T>['paginate']> {
  return (response, _allItems, currentItems) => {
    if (currentItems.length < pageSize) return false;
    const total = (response.body as Record<string, number>)[totalField];
    const nextOffset = getOffset(response) + pageSize;
    if (total !== undefined && nextOffset >= total) return false;
    return {
      searchParams: { offset: nextOffset, limit: pageSize },
    };
  };
}

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
export function paginateByPage<T = unknown>(
  pageSize: number,
  pageParam = 'page'
): NonNullable<PaginationOptions<T>['paginate']> {
  let page = 1;
  return (_response, _allItems, currentItems) => {
    if (currentItems.length < pageSize) return false;
    page++;
    return { searchParams: { [pageParam]: page, per_page: pageSize } };
  };
}

/**
 * Builds a `paginate` function for Link-header-based pagination (GitHub style).
 *
 * @example
 * ```typescript
 * const paginate = paginateByLinkHeader();
 * ```
 */
export function paginateByLinkHeader<T = unknown>(): NonNullable<PaginationOptions<T>['paginate']> {
  return (response) => {
    const link = response.headers.get('link');
    if (!link) return false;
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (!match) return false;
    return { url: match[1] };
  };
}

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
export function paginateByCursor<T = unknown>(
  getCursor: (response: HttpResponse) => string | null | undefined,
  cursorParam = 'cursor'
): NonNullable<PaginationOptions<T>['paginate']> {
  return (response) => {
    const cursor = getCursor(response);
    if (!cursor) return false;
    return { searchParams: { [cursorParam]: cursor } };
  };
}
