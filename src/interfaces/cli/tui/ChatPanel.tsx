import { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { renderMarkdown } from "./markdown.js";
import { COLORS } from "./theme.js";
import type { ChatMessage } from "./App.js";

function fg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}
const RST = "\x1b[0m";

// ── Thinking indicator ─────────────────────────────────────────

function ThinkingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % 3), 500);
    return () => clearInterval(timer);
  }, []);
  const dots = ["·  ", "·· ", "···"][frame];
  return (
    <Box paddingX={1}>
      <Text color={COLORS.primary}>┃ </Text>
      <Text color={COLORS.dimmed}>{dots}</Text>
    </Box>
  );
}

// ── Chat panel ─────────────────────────────────────────────────

interface ChatPanelProps {
  messages: ChatMessage[];
  height: number;
  width: number;
  isLoading: boolean;
  onSubmit: (text: string) => void;
}

export function ChatPanel({ messages, height, width, isLoading, onSubmit }: ChatPanelProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [inputValue, setInputValue] = useState("");

  // height - 2 (border) - 1 (input) - 1 (separator) - thinking
  const thinkingH = isLoading ? 1 : 0;
  const displayHeight = Math.max(1, height - 4 - thinkingH);
  const innerWidth = width - 4;

  const renderedLines = useMemo(() => {
    if (messages.length === 0) return [];
    const lines: string[] = [];
    for (const msg of messages) {
      lines.push(...renderMessage(msg, innerWidth));
    }
    return lines;
  }, [messages, innerWidth]);

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

  const handleSubmit = (text: string) => {
    if (!text.trim()) return;
    onSubmit(text);
    setInputValue("");
  };

  const visibleLines = renderedLines.slice(scrollOffset, scrollOffset + displayHeight);
  const atBottom = scrollOffset >= renderedLines.length - displayHeight;
  const canScroll = renderedLines.length > displayHeight;

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="single" borderColor={COLORS.border}>
      {/* Messages */}
      <Box flexDirection="column" height={displayHeight} overflow="hidden" paddingX={1}>
        {messages.length === 0 ? (
          <Box flexDirection="column" justifyContent="center" alignItems="center" height={displayHeight}>
            <Text color={COLORS.veryDim}>ask rue anything</Text>
            <Text color={COLORS.border}>/help for commands</Text>
          </Box>
        ) : (
          visibleLines.map((line, i) => (
            <Text key={scrollOffset + i} wrap="truncate">{line}</Text>
          ))
        )}
      </Box>

      {/* Thinking */}
      {isLoading && <ThinkingDots />}

      {/* Scroll */}
      {canScroll && !atBottom && !isLoading && (
        <Box justifyContent="flex-end" paddingRight={1}>
          <Text color={COLORS.veryDim}>↓</Text>
        </Box>
      )}

      {/* Input separator + input */}
      <Box paddingX={1}>
        <Text color={COLORS.border}>{"─".repeat(Math.max(1, width - 4))}</Text>
      </Box>
      <Box paddingX={1}>
        <Text color={isLoading ? COLORS.veryDim : COLORS.primary}>❯ </Text>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          placeholder={isLoading ? "" : "message"}
        />
      </Box>
    </Box>
  );
}

// ── Message rendering ──────────────────────────────────────────
// Uses colored vertical bars as role indicators:
//   ┃ = rue (primary/mint)
//   │ = you (info/periwinkle)
// Much cleaner than text labels. Time is right-aligned on the first line.

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

// Background color from hex
function bg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[48;2;${r};${g};${b}m`;
}

// Pad a line to full width with background
function padLine(line: string, maxWidth: number, bgCode: string): string {
  const vis = visibleLength(line);
  const pad = Math.max(0, maxWidth - vis);
  return `${bgCode}${line}${" ".repeat(pad)}${RST}`;
}

function renderMessage(msg: ChatMessage, maxWidth: number): string[] {
  const lines: string[] = [];
  const time = formatTime(msg.timestamp);
  const contentWidth = maxWidth - 2;

  // User messages: subtle background tint on every line
  const userBg = bg("#262630"); // subtle gray lift

  switch (msg.role) {
    case "user": {
      lines.push(" ");
      const allLines = msg.content.split("\n");
      const first = allLines[0];
      const timeStr = time ? `  ${fg(COLORS.veryDim)}${time}` : "";
      lines.push(padLine(` ${fg(COLORS.info)}⏺${RST}${userBg} ${first}${timeStr}`, maxWidth, userBg));
      for (let i = 1; i < allLines.length; i++) {
        for (const w of wrapLine(`  ${userBg} ${allLines[i]}`, contentWidth, `  ${userBg} `)) {
          lines.push(padLine(w, maxWidth, userBg));
        }
      }
      lines.push(" ");
      break;
    }

    case "assistant": {
      if (msg.isStreaming && !msg.content) break;
      if (msg.content) {
        lines.push(" ");
        const rendered = renderMarkdown(msg.content, contentWidth - 4);
        const rLines = rendered.split("\n");
        if (rLines.length > 0) {
          const timeStr = time ? `  ${fg(COLORS.veryDim)}${time}${RST}` : "";
          lines.push(` ${fg(COLORS.primary)}⏺${RST} ${rLines[0]}${timeStr}`);
        }
        for (let i = 1; i < rLines.length; i++) {
          for (const w of wrapLine(`   ${rLines[i]}`, contentWidth, `   `)) {
            lines.push(w);
          }
        }
      }
      lines.push(" ");
      break;
    }

    case "system":
      lines.push(`${fg(COLORS.veryDim)}  ${msg.content}${RST}`);
      break;
  }

  return lines;
}

function visibleLength(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function formatTime(ts: number): string {
  if (!ts || isNaN(ts)) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
