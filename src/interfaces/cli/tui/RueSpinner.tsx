import { useState, useEffect } from "react";
import { Text } from "ink";
import { COLORS } from "./theme.js";

const INLINE_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

const BLOCK_FRAMES = [
  "   \u25CF    ",
  "  \u25CF \u25CF   ",
  " \u25CF   \u25CF  ",
  "\u25CF     \u25CF ",
  " \u25CF   \u25CF  ",
  "  \u25CF \u25CF   ",
];

interface RueSpinnerProps {
  mode?: "inline" | "block";
}

export function RueSpinner({ mode = "inline" }: RueSpinnerProps) {
  const [frame, setFrame] = useState(0);
  const frames = mode === "block" ? BLOCK_FRAMES : INLINE_FRAMES;
  const interval = mode === "block" ? 200 : 80;

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, interval);
    return () => clearInterval(timer);
  }, [frames.length, interval]);

  return <Text color={COLORS.primary}>{frames[frame]}</Text>;
}
