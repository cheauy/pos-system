// Each effect owns its channel. Cleanup is asynchronous, so a remount must not
// reuse a subscribed channel that is still being removed by the previous effect.
let sequence = 0;
const instance = Math.random().toString(36).slice(2);
export function realtimeTopic(scope: string): string {
  return `${scope}:${instance}:${++sequence}`;
}
