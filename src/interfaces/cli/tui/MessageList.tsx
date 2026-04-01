import { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { RueSpinner } from "./RueSpinner.js";
import { renderMarkdown } from "./markdown.js";
import type { ChatMessage } from "./App.js";

interface MessageListProps {
  messages: ChatMessage[];
  height: number;
  width: number;
  isLoading: boolean;
}

export function MessageList({ messages, height, width, isLoading }: MessageListProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  // Render all messages to lines
  const renderedLines = useMemo(() => {
    if (messages.length === 0) return [];
    const lines: string[] = [];
    for (const msg of messages) {
      lines.push(...renderMessage(msg, width));
    }
    if (isLoading && !messages.some(m => m.isStreaming && m.content)) {
      lines.push("");
      lines.push("  \x1b[38;2;168;144;128m⠋ thinking...\x1b[0m");
    }
    return lines;
  }, [messages, width, isLoading]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const maxOffset = Math.max(0, renderedLines.length - height);
    setScrollOffset(maxOffset);
  }, [renderedLines.length, height]);

  // Keyboard scrolling
  useInput((_input, key) => {
    const maxOffset = Math.max(0, renderedLines.length - height);
    if (key.upArrow || (key.ctrl && _input === "u")) {
      setScrollOffset((prev) => Math.max(0, prev - (key.ctrl ? Math.floor(height / 2) : 1)));
    }
    if (key.downArrow || (key.ctrl && _input === "d")) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + (key.ctrl ? Math.floor(height / 2) : 1)));
    }
    if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - height));
    }
    if (key.pageDown) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + height));
    }
  });

  // Empty state
  if (messages.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" height={height} width={width}>
        <RueSpinner mode="block" />
        <Box marginTop={1}>
          <Text color="#E8B87A" bold>rue</Text>
          <Text color="#A89080"> v0.1.0</Text>
        </Box>
        <Text color="#6B6560">Type a message to start, or /help for commands</Text>
      </Box>
    );
  }

  // Slice visible lines based on scroll offset
  const visible = renderedLines.slice(scrollOffset, scrollOffset + height);
  const atBottom = scrollOffset >= renderedLines.length - height;
  const canScroll = renderedLines.length > height;

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      <Box flexDirection="column" paddingX={1}>
        {visible.map((line, i) => (
          <Text key={scrollOffset + i} wrap="truncate">{line}</Text>
        ))}
      </Box>
      {/* Scroll indicator */}
      {canScroll && !atBottom && (
        <Box position="absolute" marginLeft={width - 4}>
          <Text color="#4A3F35">↓</Text>
        </Box>
      )}
    </Box>
  );
}

function renderMessage(msg: ChatMessage, _width: number): string[] {
  const lines: string[] = [];
  const time = formatTime(msg.timestamp);
  const reset = "\x1b[0m";
  const divider = `\x1b[38;2;38;34;32m${"─".repeat(_width)}${reset}`;

  switch (msg.role) {
    case "user":
      lines.push(divider);
      lines.push(`  \x1b[1;38;2;122;162;212m> you${reset} \x1b[38;2;107;101;96m${time}${reset}`);
      for (const line of msg.content.split("\n")) {
        lines.push(`    ${line}`);
      }
      break;

    case "assistant": {
      lines.push(divider);
      const thinking = msg.isStreaming && !msg.content;
      lines.push(`  \x1b[1;38;2;232;184;122m> rue${reset} \x1b[38;2;107;101;96m${time}${reset}${thinking ? " \x1b[38;2;232;184;122m⠋\x1b[0m" : ""}`);
      if (msg.content) {
        const rendered = renderMarkdown(msg.content);
        for (const line of rendered.split("\n")) {
          lines.push(`    ${line}`);
        }
      }
      break;
    }

    case "system":
      lines.push("");
      lines.push(`  \x1b[3;38;2;107;101;96m~ ${msg.content}\x1b[0m`);
      break;
  }

  return lines;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
