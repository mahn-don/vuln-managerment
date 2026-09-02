import type { PaginationParams } from "@/types/api";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get("page") || String(DEFAULT_PAGE), 10));
  const rawLimit = parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
  const sort = searchParams.get("sort") || undefined;
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  return { page, limit, sort, order };
}

export function toPrismaOrderBy(
  sort: string | undefined,
  order: "asc" | "desc",
  allowedSortFields: string[]
): Record<string, "asc" | "desc"> | undefined {
  if (!sort || !allowedSortFields.includes(sort)) return undefined;
  return { [sort]: order };
}

export function toPrismaSkipTake(page: number, limit: number) {
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}
