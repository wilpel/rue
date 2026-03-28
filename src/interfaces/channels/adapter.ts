export interface InboundMessage {
  source: string;
  channel: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export interface OutboundMessage {
  target: string;
  channel: string;
  recipientId: string;
  text: string;
}

export interface ChannelAdapter {
  readonly id: string;
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (msg: InboundMessage) => void): void;
  send(msg: OutboundMessage): Promise<void>;
}
