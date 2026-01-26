import { spawn } from 'child_process';

/**
 * Spawns a CLI process with full diagnostic capture.
 * Use this instead of bare spawn() in tests for better failure messages.
 *
 * When the process exits with a non-zero code, diagnostic info is automatically
 * logged including the command, exit code, and captured stderr.
 *
 * @param {string} binPath - Path to the binary/script
 * @param {string[]} args - Arguments (will be passed after binPath to node)
 * @param {object} [options={}] - Additional spawn options (cwd, env, etc.)
 * @returns {{child: ChildProcess, diagnostics: () => string}}
 */
export function spawnCLI(binPath, args = [], options = {}) {
  let stdoutBuffer = '';
  let stderrBuffer = '';

  const child = spawn('node', [binPath, ...args], {
    ...options,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderrBuffer += data.toString();
  });

  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.log('\n[TEST DIAGNOSTIC] Child process failed');
      console.log(`  Exit code: ${code}${signal ? `, signal: ${signal}` : ''}`);
      console.log(`  Command: node ${binPath} ${args.join(' ')}`);
      if (stderrBuffer.trim()) {
        // Limit stderr output to last 1000 chars to avoid flooding
        const stderr = stderrBuffer.trim();
        console.log(`  stderr: ${stderr.length > 1000 ? '...' + stderr.slice(-1000) : stderr}`);
      }
    }
  });

  return {
    child,
    /** Returns captured stdout and stderr for additional assertions */
    getOutput: () => ({ stdout: stdoutBuffer, stderr: stderrBuffer }),
    /** Returns formatted diagnostic string */
    diagnostics: () => `stdout:\n${stdoutBuffer}\nstderr:\n${stderrBuffer}`,
  };
}
