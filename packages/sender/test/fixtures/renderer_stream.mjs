// Emit one valid frame followed by a couple of bad lines. The test
// harness will ensure that only the valid frame is processed.
console.log('{"ts":1,"frame":1,"fps":60,"format":"rgb8","sides":{}}');
// This line isn't JSON at all.
console.log('not json');
// This line is JSON but uses an unsupported format.
console.log('{"ts":2,"frame":2,"fps":60,"format":"hsv","sides":{}}');
// Give the parent process a moment to read the lines before exiting.
setTimeout(() => process.exit(0), 10);
