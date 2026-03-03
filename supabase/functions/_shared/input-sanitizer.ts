/**
 * input-sanitizer.ts — Sanitizes user-provided text fields in Edge Functions.
 *
 * Strips potentially dangerous HTML/script content from string fields
 * before they are persisted to the database. Prevents stored XSS attacks.
 *
 * Pattern adapted from vault module: input-sanitizer-edge-functions (validated).
 */

/**
 * Strips HTML tags, script blocks, and event handlers from a string.
 * Preserves legitimate text content while removing injection vectors.
 */
export function sanitizeString(input: string): string {
  return input
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove event handlers (onclick, onerror, onload, etc.)
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s*on\w+\s*=\s*[^\s>]+/gi, "")
    // Remove HTML tags (but keep text content between them)
    .replace(/<\/?[^>]+(>|$)/g, "")
    // Remove javascript: and data: URI schemes
    .replace(/javascript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sanitizes all string fields in a flat object.
 * Only processes fields listed in `fields`. Non-string or absent fields are skipped.
 *
 * @param body   - The raw request body
 * @param fields - List of field names to sanitize
 * @returns A new object with sanitized string fields
 */
export function sanitizeFields<T extends Record<string, unknown>>(
  body: T,
  fields: string[],
): T {
  const result = { ...body };

  for (const field of fields) {
    const value = result[field];
    if (typeof value === "string" && value.length > 0) {
      (result as Record<string, unknown>)[field] = sanitizeString(value);
    }
  }

  return result;
}

/**
 * Sanitizes string items in an array field.
 */
export function sanitizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeString(item));
}
