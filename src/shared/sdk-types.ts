/** Types for Claude Agent SDK messages to avoid unsafe casts */

export interface SDKSystemMessage {
  type: "system";
  subtype: string;
  session_id?: string;
}

export interface SDKStreamEvent {
  type: "stream_event";
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
  };
}

export interface SDKAssistantMessage {
  type: "assistant";
  message: {
    content: Array<SDKContentBlock>;
  };
  parent_tool_use_id: string | null;
}

export interface SDKUserMessage {
  type: "user";
  message: {
    content: Array<{ type: string; tool_use_id?: string }>;
  };
}

export interface SDKResultMessage {
  type: "result";
  subtype: string;
  total_cost_usd: number;
  num_turns?: number;
  result?: string;
  session_id?: string;
  errors?: string[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export type SDKContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; id?: string; input?: Record<string, unknown> }
  | { type: string };

export type SDKMessage =
  | SDKSystemMessage
  | SDKStreamEvent
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKResultMessage
  | { type: string };
