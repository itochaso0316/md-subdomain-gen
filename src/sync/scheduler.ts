import type { SyncConfig } from '../config.js';

// ── Types ────────────────────────────────────────────────────────────

export interface Scheduler {
  /** Start the scheduler. */
  start(): void;
  /** Stop the scheduler and clear all timers. */
  stop(): void;
  /** Run the sync callback immediately (outside the normal schedule). */
  runNow(): Promise<void>;
  /** Whether the scheduler is currently active. */
  readonly running: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Parse an interval string like "6h", "30m", "1d", "300s" into
 * milliseconds.
 */
function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(
      `Invalid interval: "${interval}". Use format like "6h", "30m", "1d".`,
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * multipliers[unit];
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Create a scheduler that runs the `onSync` callback at the interval
 * defined in the sync config.
 */
export function createScheduler(
  config: SyncConfig,
  onSync: () => Promise<void>,
): Scheduler {
  let timer: ReturnType<typeof setInterval> | null = null;
  let isRunning = false;
  let syncInProgress = false;

  const intervalMs = parseInterval(config.polling_interval);

  const executeSafe = async () => {
    if (syncInProgress) {
      console.log('[scheduler] Previous sync still running, skipping.');
      return;
    }
    syncInProgress = true;
    try {
      await onSync();
    } catch (err) {
      console.error('[scheduler] Sync error:', err);
    } finally {
      syncInProgress = false;
    }
  };

  const scheduler: Scheduler = {
    start() {
      if (isRunning) return;
      isRunning = true;
      console.log(
        `[scheduler] Started — interval: ${config.polling_interval} (${intervalMs}ms)`,
      );

      // Run immediately on start, then at the configured interval
      void executeSafe();
      timer = setInterval(() => void executeSafe(), intervalMs);
    },

    stop() {
      if (!isRunning) return;
      isRunning = false;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      console.log('[scheduler] Stopped.');
    },

    async runNow() {
      await executeSafe();
    },

    get running() {
      return isRunning;
    },
  };

  return scheduler;
}
