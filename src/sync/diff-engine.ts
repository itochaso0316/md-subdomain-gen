import { createHash } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────

export interface DiffResult {
  /** True when any difference was detected between old and new content. */
  changed: boolean;
  /** SHA-256 hash of the old content. */
  oldHash: string;
  /** SHA-256 hash of the new content. */
  newHash: string;
  /** Approximate ratio of changed lines (0–1). */
  changeRatio: number;
  /** Lines added in the new content. */
  addedLines: string[];
  /** Lines removed from the old content. */
  removedLines: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Simple line-level diff. For production use consider a more
 * sophisticated algorithm; this covers the common case efficiently.
 */
function diffLines(
  oldLines: string[],
  newLines: string[],
): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const added = newLines.filter((l) => !oldSet.has(l));
  const removed = oldLines.filter((l) => !newSet.has(l));

  return { added, removed };
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Detect changes between two content strings. Uses a content hash for
 * quick identity comparison, then falls back to a line-level diff for
 * change details.
 */
export function detectChanges(
  oldContent: string,
  newContent: string,
): DiffResult {
  const oldHash = sha256(oldContent);
  const newHash = sha256(newContent);

  // Fast path: identical content
  if (oldHash === newHash) {
    return {
      changed: false,
      oldHash,
      newHash,
      changeRatio: 0,
      addedLines: [],
      removedLines: [],
    };
  }

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const { added, removed } = diffLines(oldLines, newLines);

  const totalLines = Math.max(oldLines.length, newLines.length, 1);
  const changeRatio =
    Math.round(((added.length + removed.length) / totalLines) * 100) / 100;

  return {
    changed: true,
    oldHash,
    newHash,
    changeRatio,
    addedLines: added,
    removedLines: removed,
  };
}

/**
 * Determine whether the detected diff warrants a full markdown
 * regeneration.
 *
 * Regeneration is recommended when:
 * - Content has actually changed, AND
 * - The change ratio exceeds 5 % (to avoid regenerating on trivial
 *   whitespace / timestamp changes).
 */
export function shouldRegenerate(diff: DiffResult): boolean {
  if (!diff.changed) return false;
  return diff.changeRatio > 0.05;
}
