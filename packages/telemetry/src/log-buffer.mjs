/**
 * Ring buffer for storing log entries with a configurable maximum size.
 * Entries are stored newest-first and old entries are automatically removed
 * when the buffer reaches capacity.
 */
export class LogBuffer {
  #entries = [];
  #maxSize;

  /**
   * Create a new LogBuffer
   * @param {number} maxSize - Maximum number of entries to store (default 1000)
   */
  constructor(maxSize = 1000) {
    this.#maxSize = maxSize;
  }

  /**
   * Add a log entry to the buffer
   * @param {object} entry - Log entry to add
   * @returns {object} The entry with timestamp added if not present
   */
  add(entry) {
    const entryWithTimestamp = {
      ...entry,
      receivedAt: entry.receivedAt ?? Date.now()
    };

    this.#entries.unshift(entryWithTimestamp);

    // Remove oldest entries if we exceed max size
    if (this.#entries.length > this.#maxSize) {
      this.#entries.length = this.#maxSize;
    }

    return entryWithTimestamp;
  }

  /**
   * Query log entries with optional filters
   * @param {object} options - Query options
   * @param {string} [options.level] - Filter by log level
   * @param {string} [options.component] - Filter by component name
   * @param {number} [options.limit] - Maximum number of entries to return
   * @param {number} [options.offset] - Number of entries to skip
   * @returns {object[]} Matching entries, newest first
   */
  query({ level, component, limit, offset = 0 } = {}) {
    let results = this.#entries;

    // Apply filters
    if (level) {
      results = results.filter(entry => entry.level === level);
    }

    if (component) {
      results = results.filter(entry => entry.component === component);
    }

    // Apply offset
    if (offset > 0) {
      results = results.slice(offset);
    }

    // Apply limit
    if (limit !== undefined && limit > 0) {
      results = results.slice(0, limit);
    }

    return results;
  }

  /**
   * Get all entries in the buffer
   * @returns {object[]} All entries, newest first
   */
  getAll() {
    return [...this.#entries];
  }

  /**
   * Clear all entries from the buffer
   */
  clear() {
    this.#entries = [];
  }

  /**
   * Get the current number of entries in the buffer
   * @returns {number}
   */
  get size() {
    return this.#entries.length;
  }

  /**
   * Get the maximum size of the buffer
   * @returns {number}
   */
  get maxSize() {
    return this.#maxSize;
  }
}

/**
 * Create a new LogBuffer instance
 * @param {number} maxSize - Maximum number of entries
 * @returns {LogBuffer}
 */
export function createLogBuffer(maxSize = 1000) {
  return new LogBuffer(maxSize);
}
