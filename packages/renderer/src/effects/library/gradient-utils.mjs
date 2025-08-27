export function sortColorStops(stops){
  return [...stops].sort((leftStop, rightStop) => (leftStop.pos ?? 0) - (rightStop.pos ?? 0));
}

export function sampleGradient(sortedStops, position){
  let stopIndex = 1;
  while (stopIndex < sortedStops.length && position >= sortedStops[stopIndex].pos) {
    stopIndex++;
  }
  const leftStop = sortedStops[stopIndex - 1];
  const rightStop = sortedStops[stopIndex] || { pos: leftStop.pos + 1, color: leftStop.color };
  const span = rightStop.pos - leftStop.pos;
  const interpolationAmount = span > 0 ? (position - leftStop.pos) / span : 0;
  return [
    leftStop.color[0] + (rightStop.color[0] - leftStop.color[0]) * interpolationAmount,
    leftStop.color[1] + (rightStop.color[1] - leftStop.color[1]) * interpolationAmount,
    leftStop.color[2] + (rightStop.color[2] - leftStop.color[2]) * interpolationAmount,
  ];
}
