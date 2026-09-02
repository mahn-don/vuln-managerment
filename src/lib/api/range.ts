import { z } from "zod/v4";

/**
 * The reporting window carried by the filter strip.
 *
 * Dashboards and analytics take `from` and `to` as plain ISO dates so the query
 * string stays readable and bookmarkable. Anything that is not a well-formed
 * date is dropped rather than rejected: a malformed range should widen the
 * report back to its default, not fail the request.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const rangeSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type RangeParams = z.infer<typeof rangeSchema>;

export function parseRangeParams(searchParams: URLSearchParams): RangeParams {
  const parsed = rangeSchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) return {};

  const { from, to } = parsed.data;
  // An inverted range would silently return nothing; treat it as unset.
  if (from && to && from > to) return {};
  return { from, to };
}
