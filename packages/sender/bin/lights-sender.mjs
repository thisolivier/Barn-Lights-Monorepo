#!/usr/bin/env node
// Simple entry script invoking the CLI main()
import { main } from '../src/cli.mjs';

main(process.argv)
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
