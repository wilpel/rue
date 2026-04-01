import { useState, useEffect } from "react";
import { Text } from "ink";

/**
 * Clean animated spinner for Rue. Two modes:
 * - inline: single-character dots spinner for inline use
 * - block: larger animated indicator for empty state
 */

const INLINE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const BLOCK_FRAMES = [
  "   ●    ",
  "  ● ●   ",
  " ●   ●  ",
  "●     ● ",
  " ●   ●  ",
  "  ● ●   ",
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

  return <Text color="#E8B87A">{frames[frame]}</Text>;
}
