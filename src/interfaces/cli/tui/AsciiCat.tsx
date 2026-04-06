import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { COLORS } from "./theme.js";

// The cat reacts to rue's state — it's alive.

type CatMood = "idle" | "thinking" | "streaming" | "error" | "happy";

const CAT_IDLE: string[][] = [
  [
    "  /\\_/\\  ",
    " ( o.o ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|   |_)",
  ],
  [
    "  /\\_/\\  ",
    " ( -.o ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|   |_)",
  ],
  [
    "  /\\_/\\  ",
    " ( o.o ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|   |_)",
  ],
  [
    "  /\\_/\\  ",
    " ( o.- ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|   |_)",
  ],
];

const CAT_THINKING: string[][] = [
  [
    "  /\\_/\\  ",
    " ( °o° ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_| ~ |_)",
  ],
  [
    "  /\\_/\\  ",
    " ( °O° ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|  ~|_)",
  ],
  [
    "  /\\_/\\  ",
    " ( °o° ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|~  |_)",
  ],
  [
    "  /\\_/\\  ",
    " ( °O° ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_| ~ |_)",
  ],
];

const CAT_STREAMING: string[][] = [
  [
    "  /\\_/\\  ",
    " ( ˘ᴗ˘ ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|   |_)",
  ],
  [
    "  /\\_/\\  ",
    " ( ˘ᴗ˘ )♪",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|   |_)",
  ],
];

const CAT_ERROR = [
  "  /\\_/\\  ",
  " ( >_< ) ",
  "  > ! <  ",
  " /|   |\\ ",
  "(_|   |_)",
];

const CAT_HAPPY: string[][] = [
  [
    "  /\\_/\\  ",
    " ( ^ω^ ) ",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|   |_)",
  ],
  [
    "  /\\_/\\  ",
    " ( ^ω^ )✧",
    "  > ^ <  ",
    " /|   |\\ ",
    "(_|   |_)",
  ],
];

interface AsciiCatProps {
  mood: CatMood;
  height: number;
}

export function AsciiCat({ mood, height }: AsciiCatProps) {
  const [frame, setFrame] = useState(0);

  const frames = mood === "thinking" ? CAT_THINKING
    : mood === "streaming" ? CAT_STREAMING
    : mood === "happy" ? CAT_HAPPY
    : mood === "error" ? [CAT_ERROR]
    : CAT_IDLE;

  const speed = mood === "thinking" ? 200
    : mood === "streaming" ? 500
    : mood === "idle" ? 1500
    : 600;

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, speed);
    return () => clearInterval(timer);
  }, [frames.length, speed]);

  const art = frames[frame];
  const catHeight = art.length;
  // Center cat vertically
  const topPad = Math.max(0, Math.floor((height - catHeight - 2) / 2));

  const color = mood === "thinking" ? COLORS.secondary
    : mood === "streaming" ? COLORS.primary
    : mood === "error" ? COLORS.urgent
    : mood === "happy" ? COLORS.success
    : COLORS.dimmed;

  const label = mood === "thinking" ? "hmm..."
    : mood === "streaming" ? "typing"
    : mood === "error" ? "oops"
    : mood === "happy" ? "done!"
    : "zzz";

  return (
    <Box flexDirection="column" width={12} height={height} alignItems="center" paddingX={1}>
      <Box height={topPad} />
      {art.map((line, i) => (
        <Text key={i} color={color}>{line}</Text>
      ))}
      <Text color={COLORS.veryDim}>{label}</Text>
    </Box>
  );
}
