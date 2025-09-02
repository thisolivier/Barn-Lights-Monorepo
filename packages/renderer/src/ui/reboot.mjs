import { send } from "./connection.mjs";

const DURATION_MS = 500;
const until = { left: 0, right: 0 };

export function requestReboot(side){
  const now = globalThis.performance.now();
  until[side] = now + DURATION_MS;
  send({ reboot: true, side });
}

export function tickReboot(now = globalThis.performance.now()){
  if (until.left > now) send({ reboot: true, side: "left" });
  if (until.right > now) send({ reboot: true, side: "right" });
}

