/**
 * Normalize a string for comparison/matching purposes.
 * Lowercases, trims, removes extra whitespace, removes special characters.
 */
export function normalizeString(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "");
}

/**
 * Normalize an application name for storage and matching.
 * More aggressive normalization than normalizeString.
 */
export function normalizeAppName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .replace(/\b(system|service|application|app|platform|api|v\d+)\b/g, (match) => match)
    .replace(/\s+/g, " ")
    .trim();
}
