/**
 * AI Core — Input Normalizer
 *
 * Pre-processes user input before any analysis.
 * Handles: lowercasing, punctuation cleanup, filler stripping,
 * common spelling corrections, whitespace normalization.
 *
 * CRITICAL: Preserves product/brand/model terms.
 * Uses FILLER_WORDS and PRESERVED_TERMS from constants.
 */

import { FILLER_WORDS, PRESERVED_TERMS } from "./constants";

// ─── Common Spelling Corrections ────────────────────────────────────────────
// Maps common misspellings/transliterations to canonical forms.
// Only correct when the misspelling is unambiguous.

const SPELLING_CORRECTIONS: ReadonlyArray<[RegExp, string]> = [
  // Product-related
  [/\bserbo\b/gi, "servo"],
  [/\bservoo\b/gi, "servo"],
  [/\bsarvo\b/gi, "servo"],
  [/\bserwo\b/gi, "servo"],
  [/\bboash\b/gi, "bosch"],
  [/\bbosh\b/gi, "bosch"],
  [/\bbrak\b/gi, "brake"],
  [/\bbrek\b/gi, "brake"],
  [/\bfiltar\b/gi, "filter"],
  [/\bfiltr\b/gi, "filter"],

  // Business terms
  [/\bcustmer\b/gi, "customer"],
  [/\bcustomar\b/gi, "customer"],
  [/\bcustomr\b/gi, "customer"],
  [/\bprodct\b/gi, "product"],
  [/\bprodut\b/gi, "product"],
  [/\bproduck\b/gi, "product"],
  [/\binvoce\b/gi, "invoice"],
  [/\binvioce\b/gi, "invoice"],

  // Hindi transliteration normalization
  [/\bgrahak\b/gi, "customer"],
  [/\bbikri\b/gi, "sale"],
  [/\bkeemat\b/gi, "kimat"],
  [/\bpaisa\b/gi, "paisa"],
  [/\brupaye\b/gi, "rupees"],
  [/\brupaye\b/gi, "rupees"],
];

// ─── Normalizer ─────────────────────────────────────────────────────────────

/**
 * Normalizes user input for consistent processing.
 *
 * 1. Lowercases
 * 2. Removes excessive punctuation (preserves ₹, numbers, hyphens in part numbers)
 * 3. Applies spelling corrections
 * 4. Normalizes whitespace
 *
 * Does NOT strip filler words — that's a separate step for entity extraction only.
 */
export function normalizeInput(text: string): string {
  let normalized = text
    .toLowerCase()
    // Preserve ₹ symbol, remove other special chars but keep hyphens (for part numbers like INV-001)
    .replace(/[?!.,;:'"(){}[\]@#$%^&*~`\\|<>]/g, " ")
    // Normalize unicode quotes and special chars
    .replace(/[""'']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Apply spelling corrections
  for (const [pattern, replacement] of SPELLING_CORRECTIONS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, " ").trim();
}

/**
 * Strips filler words from text for entity extraction.
 * CRITICAL: Preserves words in PRESERVED_TERMS even if they appear in FILLER_WORDS.
 *
 * @param text - Normalized input text
 * @returns Text with filler words removed
 */
export function stripFillerWords(text: string): string {
  const words = text.split(/\s+/);

  const filtered = words.filter((word) => {
    if (!word) return false;

    // Always preserve terms that could be product/brand/model names
    if (PRESERVED_TERMS.has(word)) return true;

    // Preserve numbers (they're quantities, prices, or part numbers)
    if (/^\d+(\.\d+)?$/.test(word)) return true;

    // Preserve words with digits (part numbers like "10W40")
    if (/\d/.test(word) && /[a-z]/i.test(word)) return true;

    // Preserve words longer than 2 chars that aren't fillers
    // (short words like "ka", "ke", "ki" are common Hindi particles)
    if (word.length > 2 && !FILLER_WORDS.has(word)) return true;

    // For 1-2 char words: only strip if they're known fillers
    if (word.length <= 2 && FILLER_WORDS.has(word)) return false;

    // Keep anything that's not a known filler
    return !FILLER_WORDS.has(word);
  });

  return filtered.join(" ").trim();
}

/**
 * Full normalization pipeline for entity extraction.
 * Combines input normalization + filler stripping.
 */
export function normalizeForEntityExtraction(text: string): string {
  return stripFillerWords(normalizeInput(text));
}
