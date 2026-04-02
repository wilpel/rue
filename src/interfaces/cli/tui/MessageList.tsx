import { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { renderMarkdown } from "./markdown.js";
import { COLORS } from "./theme.js";
import type { ChatMessage } from "./App.js";

/** Convert a hex color like "#E8B87A" to an ANSI 24-bit foreground escape */
function fg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

const RST = "\x1b[0m";

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
      lines.push(`  ${fg(COLORS.quoteText)}⠋ thinking...${RST}`);
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
        <Text color={COLORS.dimmed}>Type a message to start, or /help for commands</Text>
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
        <Box justifyContent="flex-end" paddingRight={2}>
          <Text color={COLORS.veryDim}>↓ more</Text>
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
  const divider = `${fg(COLORS.border)}${"─".repeat(_width)}${RST}`;
  const contentWidth = _width - 6; // account for indent + padding

  switch (msg.role) {
    case "user":
      lines.push(divider);
      lines.push(`  \x1b[1m${fg(COLORS.info)}> you${RST} ${fg(COLORS.dimmed)}${time}${RST}`);
      for (const line of msg.content.split("\n")) {
        for (const wrapped of wrapLine(`    ${line}`, contentWidth, "    ")) {
          lines.push(wrapped);
        }
      }
      break;

    case "assistant": {
      lines.push(divider);
      const thinking = msg.isStreaming && !msg.content;
      lines.push(`  \x1b[1m${fg(COLORS.primary)}> rue${RST} ${fg(COLORS.dimmed)}${time}${RST}${thinking ? ` ${fg(COLORS.primary)}⠋${RST}` : ""}`);
      if (msg.content) {
        const rendered = renderMarkdown(msg.content, contentWidth);
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
      for (const wrapped of wrapLine(`  \x1b[3m${fg(COLORS.dimmed)}~ ${msg.content}${RST}`, contentWidth, "    ")) {
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
