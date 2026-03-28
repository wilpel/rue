import type { EventBus } from "./bus.js";
import type { ChannelName, ChannelPayload } from "./channels.js";

export interface BusMiddleware {
  name: string;
  onEmit?<C extends ChannelName>(
    channel: C,
    payload: ChannelPayload<C>,
  ): ChannelPayload<C> | null | undefined | void;
}

export function applyMiddleware(bus: EventBus, middlewares: BusMiddleware[]): EventBus {
  const originalEmit = bus.emit.bind(bus);

  bus.emit = <C extends ChannelName>(channel: C, payload: ChannelPayload<C>): void => {
    let current: ChannelPayload<C> | null = payload;

    for (const mw of middlewares) {
      if (!mw.onEmit) continue;
      const result = mw.onEmit(channel, current!);
      if (result === null) return;
      if (result !== undefined) {
        current = result as ChannelPayload<C>;
      }
    }

    originalEmit(channel, current!);
  };

  return bus;
}
