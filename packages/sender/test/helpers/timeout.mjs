/**
 * Wraps a promise with a timeout to prevent tests from hanging.
 *
 * @param {Promise} promise - The promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} [message='Operation timed out'] - Error message if timeout occurs
 * @returns {Promise} - Resolves with the original promise result or rejects on timeout
 */
export function withTimeout(promise, ms, message = 'Operation timed out') {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  );
  return Promise.race([promise, timeout]);
}
