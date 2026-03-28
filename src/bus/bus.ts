import type { ChannelName, ChannelPayload, BusChannels } from "./channels.js";

type Handler<C extends ChannelName> = (payload: ChannelPayload<C>) => void;
type WildcardHandler = (channel: string, payload: unknown) => void;
type RequestHandler<C extends ChannelName> = (payload: ChannelPayload<C>) => Promise<unknown>;
type Unsubscribe = () => void;

export class EventBus {
  private listeners = new Map<string, Set<Handler<ChannelName>>>();
  private wildcardListeners = new Map<string, Set<WildcardHandler>>();
  private requestHandlers = new Map<string, RequestHandler<ChannelName>>();

  on<C extends ChannelName>(channel: C, handler: Handler<C>): Unsubscribe {
    const set = this.listeners.get(channel) ?? new Set();
    set.add(handler as Handler<ChannelName>);
    this.listeners.set(channel, set);
    return () => {
      set.delete(handler as Handler<ChannelName>);
    };
  }

  once<C extends ChannelName>(channel: C, handler: Handler<C>): Unsubscribe {
    const unsub = this.on(channel, ((payload: ChannelPayload<C>) => {
      unsub();
      handler(payload);
    }) as Handler<C>);
    return unsub;
  }

  onWildcard(pattern: string, handler: WildcardHandler): Unsubscribe {
    const prefix = pattern.replace(/\*$/, "");
    const set = this.wildcardListeners.get(prefix) ?? new Set();
    set.add(handler);
    this.wildcardListeners.set(prefix, set);
    return () => {
      set.delete(handler);
    };
  }

  emit<C extends ChannelName>(channel: C, payload: ChannelPayload<C>): void {
    const handlers = this.listeners.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
    for (const [prefix, wildcardHandlers] of this.wildcardListeners) {
      if (channel.startsWith(prefix)) {
        for (const handler of wildcardHandlers) {
          handler(channel, payload);
        }
      }
    }
  }

  handle<C extends ChannelName>(channel: C, handler: RequestHandler<C>): Unsubscribe {
    this.requestHandlers.set(channel, handler as RequestHandler<ChannelName>);
    return () => {
      this.requestHandlers.delete(channel);
    };
  }

  async request<C extends ChannelName>(
    channel: C,
    payload: ChannelPayload<C>,
    opts?: { timeoutMs?: number },
  ): Promise<unknown> {
    const handler = this.requestHandlers.get(channel);
    if (!handler) {
      throw new Error(`No handler registered for channel "${channel}"`);
    }
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    return Promise.race([
      handler(payload),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Request to "${channel}" timed out`)), timeoutMs),
      ),
    ]);
  }

  waitFor<C extends ChannelName>(
    channel: C,
    opts?: { timeoutMs?: number },
  ): Promise<ChannelPayload<C>> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`waitFor "${channel}" timed out`));
      }, timeoutMs);
      const unsub = this.once(channel, ((payload: ChannelPayload<C>) => {
        clearTimeout(timer);
        resolve(payload);
      }) as Handler<C>);
    });
  }

  removeAllListeners(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
    this.requestHandlers.clear();
  }
}
