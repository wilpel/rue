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
  const displayHeight = height - 1;
  useEffect(() => {
    const maxOffset = Math.max(0, renderedLines.length - displayHeight);
    setScrollOffset(maxOffset);
  }, [renderedLines.length, displayHeight]);

  // Keyboard scrolling
  useInput((_input, key) => {
    const maxOffset = Math.max(0, renderedLines.length - displayHeight);
    if (key.upArrow || (key.ctrl && _input === "u")) {
      setScrollOffset((prev) => Math.max(0, prev - (key.ctrl ? Math.floor(displayHeight / 2) : 1)));
    }
    if (key.downArrow || (key.ctrl && _input === "d")) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + (key.ctrl ? Math.floor(displayHeight / 2) : 1)));
    }
    if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - displayHeight));
    }
    if (key.pageDown) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + displayHeight));
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

  const atBottom = scrollOffset >= renderedLines.length - displayHeight;
  const canScroll = renderedLines.length > displayHeight;

  const visibleForDisplay = renderedLines.slice(scrollOffset, scrollOffset + displayHeight);

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      <Box flexDirection="column" paddingX={1} height={displayHeight}>
        {visibleForDisplay.map((line, i) => (
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

/** Wrap a line to fit within maxWidth, preserving indent */
function wrapLine(line: string, maxWidth: number, indent: string): string[] {
  // Strip ANSI to measure visible length
  const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
  if (visible.length <= maxWidth) return [line];

  // Simple word wrap on the visible text
  const words = visible.split(" ");
  const wrapped: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      wrapped.push(current);
      current = indent + word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) wrapped.push(current);
  return wrapped.length > 0 ? wrapped : [line];
}

function renderMessage(msg: ChatMessage, _width: number): string[] {
  const lines: string[] = [];
  const time = formatTime(msg.timestamp);
  const reset = "\x1b[0m";
  const divider = `\x1b[38;2;38;34;32m${"─".repeat(_width)}${reset}`;
  const contentWidth = _width - 6; // account for indent + padding

  switch (msg.role) {
    case "user":
      lines.push(divider);
      lines.push(`  \x1b[1;38;2;122;162;212m> you${reset} \x1b[38;2;107;101;96m${time}${reset}`);
      for (const line of msg.content.split("\n")) {
        for (const wrapped of wrapLine(`    ${line}`, contentWidth, "    ")) {
          lines.push(wrapped);
        }
      }
      break;

    case "assistant": {
      lines.push(divider);
      const thinking = msg.isStreaming && !msg.content;
      lines.push(`  \x1b[1;38;2;232;184;122m> rue${reset} \x1b[38;2;107;101;96m${time}${reset}${thinking ? " \x1b[38;2;232;184;122m⠋\x1b[0m" : ""}`);
      if (msg.content) {
        const rendered = renderMarkdown(msg.content);
        for (const line of rendered.split("\n")) {
          for (const wrapped of wrapLine(`    ${line}`, contentWidth, "    ")) {
            lines.push(wrapped);
          }
        }
      }
      break;
    }

    case "system":
      lines.push("");
      for (const wrapped of wrapLine(`  \x1b[3;38;2;107;101;96m~ ${msg.content}\x1b[0m`, contentWidth, "    ")) {
        lines.push(wrapped);
      }
      break;
  }

  return lines;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
