// Spawn and manage the external renderer process.
//
// The renderer is expected to write NDJSON (newline-delimited JSON)
// frames to stdout. Each JSON object must have a `format` field of
// "rgb8" or it will be ignored.
import { spawn } from 'child_process';
import readline from 'readline';
import { EventEmitter } from 'events';

export class RendererProcess extends EventEmitter {
  constructor(runtimeConfig, logger = console) {
    super();
    // Remember the configuration object and a simple logger so we can
    // report problems to the user.
    this.config = runtimeConfig;
    this.logger = logger;
    // Will hold a handle to the spawned child process.
    this.child = null;
  }

  // Start the renderer process and wire up stdout/exit handlers.
  start() {
    const { cmd, args, cwd } = this.config.renderer;
    const options = {};
    if (cwd) {
      // Allow the caller to control the renderer's working directory.
      options.cwd = cwd;
    }
    // Spawn the renderer process with the provided command and args.
    this.child = spawn(cmd, args, options);

    // Create a line reader on the child's stdout so we get complete
    // NDJSON objects instead of partial buffers.
    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on('line', (line) => {
      let parsed;
      try {
        // NDJSON is just JSON separated by newlines, so each line
        // should be a complete JSON object.
        parsed = JSON.parse(line);
      } catch (err) {
        // If the line isn't valid JSON we log and skip it rather than
        // crashing the whole process.
        this.logger.error(`Failed to parse NDJSON line: ${line}`);
        return;
      }
      if (parsed.format !== 'rgb8') {
        // The renderer might emit other formats, but for now we only
        // understand "rgb8" frames.
        this.logger.error(`Unsupported format: ${parsed.format}`);
        return;
      }
      // Notify listeners that we have a valid frame to assemble.
      this.emit('FrameIngest', parsed);
    });

    // If the renderer exits with a nonzero code we treat it as a crash
    // and surface an error so the CLI can fail with the proper code.
    this.child.on('exit', (code, signal) => {
      if (code !== 0) {
        const err = new Error(`Renderer exited with code ${code}${signal ? ` and signal ${signal}` : ''}`);
        this.emit('error', err);
      }
    });

    // Propagate other child process errors to listeners.
    this.child.on('error', (err) => {
      this.emit('error', err);
    });

    return this.child;
  }

  // Allow callers to stop the renderer if needed, e.g. on shutdown.
  stop() {
    if (this.child) {
      this.child.kill();
    }
  }
}
