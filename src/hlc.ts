export interface HLC {
  ts: number;
  count: number;
  node: string;
}

export function pack({ ts, count, node }: HLC): string {
  return [
    ts.toString().padStart(15, '0'),
    count.toString(36).padStart(5, '0'),
    node,
  ].join(':');
}

export function unpack(serialized: string): HLC {
  const [ts, count, ...node] = serialized.split(':');
  return {
    ts: parseInt(ts),
    count: parseInt(count, 36),
    node: node.join(':'),
  };
}

export function init(node: string, now: number): HLC {
  return {
    ts: now,
    count: 0,
    node,
  };
}

export function cmp(one: HLC, two: HLC): number {
  if (one.ts == two.ts) {
    if (one.count === two.count) {
      if (one.node === two.node) {
        return 0;
      }
      return one.node < two.node ? -1 : 1;
    }
    return one.count - two.count;
  }
  return one.ts - two.ts;
}

export function inc(local: HLC, now: number): HLC {
  if (now > local.ts) {
    return { ts: now, count: 0, node: local.node };
  }

  return { ...local, count: local.count + 1 };
}

export function recv(local: HLC, remote: HLC, now: number): HLC {
  if (now > local.ts && now > remote.ts) {
    return { ...local, ts: now, count: 0 };
  }

  if (local.ts === remote.ts) {
    return { ...local, count: Math.max(local.count, remote.count) + 1 };
  } else if (local.ts > remote.ts) {
    return { ...local, count: local.count + 1 };
  } else {
    return { ...local, ts: remote.ts, count: remote.count + 1 };
  }
}

export function validate(
  time: HLC,
  now: number,
  maxDrift: number = 60 * 1000
): string | null {
  if (time.count > Math.pow(36, 5)) {
    return 'counter-overflow';
  }
  // if a timestamp is more than 1 minute off from our local wall clock, something has gone horribly wrong.
  if (Math.abs(time.ts - now) > maxDrift) {
    return 'clock-off';
  }
  return null;
}

export class Clock {
  #hlc: HLC;

  constructor(node: string) {
    this.#hlc = init(node, Date.now());
  }

  inc() {
    return pack((this.#hlc = inc(this.#hlc, Date.now())));
  }

  recv(hlc: string) {
    this.#hlc = recv(this.#hlc, unpack(hlc), Date.now());
  }

  validate(maxDrift?: number) {
    return validate(this.#hlc, Date.now(), maxDrift);
  }
}
