import { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { renderMarkdown } from "./markdown.js";
import { COLORS } from "./theme.js";
import type { ChatMessage } from "./App.js";

// ── Loading animation ──────────────────────────────────────────

const LOAD_FRAMES = [
  "  ░ ·   ·   · ░  ",
  "  · ░ ·   · ░ ·  ",
  "  ·   ░ · ░   ·  ",
  "  ·   · ░ ·   ·  ",
  "  ·   ░ · ░   ·  ",
  "  · ░ ·   · ░ ·  ",
];

function LoadingBar() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % LOAD_FRAMES.length), 150);
    return () => clearInterval(timer);
  }, []);
  return (
    <Box justifyContent="center" paddingX={1}>
      <Text color={COLORS.primary}>{LOAD_FRAMES[frame]}</Text>
    </Box>
  );
}

// ── Chat view ──────────────────────────────────────────────────

/** ANSI foreground from hex */
function fg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}
const RST = "\x1b[0m";

interface ChatViewProps {
  messages: ChatMessage[];
  height: number;
  width: number;
  isLoading: boolean;
}

export function ChatView({ messages, height, width, isLoading }: ChatViewProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const loadingHeight = isLoading ? 1 : 0;
  const chatHeight = height - loadingHeight;

  const renderedLines = useMemo(() => {
    if (messages.length === 0) return [];
    const lines: string[] = [];
    for (const msg of messages) {
      lines.push(...renderMessage(msg, width));
    }
    return lines;
  }, [messages, width]);

  const displayHeight = chatHeight;

  // Auto-scroll
  useEffect(() => {
    const maxOffset = Math.max(0, renderedLines.length - displayHeight);
    setScrollOffset(maxOffset);
  }, [renderedLines.length, displayHeight]);

  useInput((_input, key) => {
    const maxOffset = Math.max(0, renderedLines.length - displayHeight);
    if (key.upArrow || (key.ctrl && _input === "u")) {
      setScrollOffset((prev) => Math.max(0, prev - (key.ctrl ? Math.floor(displayHeight / 2) : 1)));
    }
    if (key.downArrow || (key.ctrl && _input === "d")) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + (key.ctrl ? Math.floor(displayHeight / 2) : 1)));
    }
    if (key.pageUp) setScrollOffset((prev) => Math.max(0, prev - displayHeight));
    if (key.pageDown) setScrollOffset((prev) => Math.min(maxOffset, prev + displayHeight));
  });

  if (messages.length === 0) {
    return (
      <Box flexDirection="column" height={height} width={width}>
        <Box flexDirection="column" alignItems="center" justifyContent="center" height={chatHeight} width={width}>
          <Text color={COLORS.dimmed}>type a message to start</Text>
        </Box>
        {isLoading && <LoadingBar />}
      </Box>
    );
  }

  const visibleLines = renderedLines.slice(scrollOffset, scrollOffset + displayHeight);
  const atBottom = scrollOffset >= renderedLines.length - displayHeight;
  const canScroll = renderedLines.length > displayHeight;

  return (
    <Box flexDirection="column" height={height} width={width}>
      <Box flexDirection="column" height={chatHeight} overflow="hidden" paddingX={1}>
        {visibleLines.map((line, i) => (
          <Text key={scrollOffset + i} wrap="truncate">{line}</Text>
        ))}
      </Box>
      {canScroll && !atBottom && (
        <Box justifyContent="flex-end" paddingRight={1}>
          <Text color={COLORS.veryDim}>↓</Text>
        </Box>
      )}
      {isLoading && <LoadingBar />}
    </Box>
  );
}

// ── Message rendering ──────────────────────────────────────────

function wrapLine(line: string, maxWidth: number, indent: string): string[] {
  const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
  if (visible.length <= maxWidth) return [line];
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
  const contentWidth = _width - 4;

  switch (msg.role) {
    case "user":
      lines.push("");
      lines.push(` \x1b[1m${fg(COLORS.info)}you${RST} ${fg(COLORS.veryDim)}${time}${RST}`);
      for (const line of msg.content.split("\n")) {
        for (const wrapped of wrapLine(` ${fg(COLORS.info)}${line}${RST}`, contentWidth, "  ")) {
          lines.push(wrapped);
        }
      }
      break;

    case "assistant": {
      const thinking = msg.isStreaming && !msg.content;
      if (thinking) break; // Loading bar handles this
      lines.push("");
      lines.push(` \x1b[1m${fg(COLORS.primary)}rue${RST} ${fg(COLORS.veryDim)}${time}${RST}`);
      if (msg.content) {
        const rendered = renderMarkdown(msg.content, contentWidth - 2);
        for (const line of rendered.split("\n")) {
          for (const wrapped of wrapLine(` ${line}`, contentWidth, "  ")) {
            lines.push(wrapped);
          }
        }
      }
      break;
    }

    case "system":
      lines.push(` ${fg(COLORS.veryDim)}~ ${msg.content}${RST}`);
      break;
  }

  return lines;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
