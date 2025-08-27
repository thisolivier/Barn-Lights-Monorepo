// Emit a couple of non-JSON lines before the first frame to simulate
// renderer startup messages. The RendererProcess should ignore these
// lines and begin processing once the NDJSON stream starts.
console.log('renderer starting');
console.log('initializing');
console.log('{"ts":1,"frame":1,"fps":60,"format":"rgb8","sides":{}}');
setTimeout(() => process.exit(0), 10);

