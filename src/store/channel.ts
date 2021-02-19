import { createNanoEvents } from 'nanoevents';
import { io, Socket } from 'socket.io-client';
import {
  BroadcastChannel,
  createLeaderElection,
  LeaderElector,
} from 'broadcast-channel';

import { JSONOperation } from './operation';

export interface StoreSettings {
  name?: string;
  url?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  token?: string;
}

interface InvalidateMessage {
  type: 'invalidate';
  payload: {
    operations: JSONOperation[];
  };
}

interface SubscribeMessage {
  type: 'subscribe';
  payload: {
    type: string;
    id: string;
    options?: { include?: string[] };
  };
}

interface UnsubscribeMessage {
  type: 'unsubscribe';
  payload: {
    type: string;
    id: string;
    options?: { include?: string[] };
  };
}

type BroadcastChannelMessage =
  | InvalidateMessage
  | SubscribeMessage
  | UnsubscribeMessage;

export interface ChannelConnectionSettings {
  node: string;
  url: string;
  version: number;
  token?: string;
}

export class Channel {
  #emitter = createNanoEvents();
  #channel = new BroadcastChannel<BroadcastChannelMessage>('store', {
    webWorkerSupport: false,
  });
  #elector: LeaderElector;
  #subscriptions = new Map<
    string,
    { type: string; id: string; options?: { include?: string[] } }
  >();

  #socket?: Socket;

  constructor() {
    this.#elector = createLeaderElection(this.#channel);
  }

  init(settings: ChannelConnectionSettings) {
    this.#elector.awaitLeadership().then(() => {
      this.connect(settings);
    });
    this.#channel.addEventListener('message', (message) => {
      switch (message.type) {
        case 'invalidate':
          this.#emitter.emit('invalidate', message.payload.operations);
          break;
        case 'subscribe':
          this.onSubscribe(
            message.payload.type,
            message.payload.id,
            message.payload.options
          );
          break;
        case 'unsubscribe':
          this.onUnsubscribe(
            message.payload.type,
            message.payload.id,
            message.payload.options
          );
      }
    });
  }

  private connect(settings: ChannelConnectionSettings) {
    const socket = io(settings.url, {
      auth: {
        token: settings.token,
      },
      transports: ['websocket'],
      query: {
        'client-id': settings.node,
        'client-version': `${settings.version}`,
      },
    });

    socket.on('atomic:operations', (operations: JSONOperation[]) => {
      this.#emitter.emit('push', operations);
    });

    socket.on('connect', () => {
      for (const [, { type, id, options }] of this.#subscriptions) {
        socket.emit('subscribe', { type, id, ...options });
      }
    });

    this.#socket = socket;
  }

  on(
    event: 'invalidate' | 'push',
    callback: (operations: JSONOperation[]) => void
  ) {
    return this.#emitter.on(event, callback);
  }

  invalidate(operations: JSONOperation[]) {
    this.#channel.postMessage({
      type: 'invalidate',
      payload: {
        operations,
      },
    });
  }

  subscribe(type: string, id: string, options?: { include?: string[] }) {
    this.#channel.postMessage({
      type: 'subscribe',
      payload: {
        type,
        id,
        options,
      },
    });
    this.onSubscribe(type, id, options);
    return () => this.unsubscribe(type, id, options);
  }

  unsubscribe(type: string, id: string, options?: { include?: string[] }) {
    this.#channel.postMessage({
      type: 'unsubscribe',
      payload: {
        type,
        id,
        options,
      },
    });
    this.onUnsubscribe(type, id, options);
  }

  private onSubscribe(
    type: string,
    id: string,
    options?: { include?: string[] }
  ) {
    const key = [type, id, ...(options?.include ?? [])].join(':');
    this.#subscriptions.set(key, {
      type,
      id,
      options,
    });
    if (this.#socket?.connected) {
      this.#socket.emit('subscribe', { type, id, ...options });
    }
  }

  private onUnsubscribe(
    type: string,
    id: string,
    options?: { include?: string[] }
  ) {
    const key = [type, id, ...(options?.include ?? [])].join(':');
    this.#subscriptions.delete(key);
    if (this.#socket?.connected) {
      this.#socket.emit('unsubscribe', { type, id, ...options });
    }
  }
}
