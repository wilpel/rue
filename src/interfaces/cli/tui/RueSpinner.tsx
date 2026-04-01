import { useState, useEffect } from "react";
import { Text } from "ink";

/**
 * Rue's animated blob mascot. Used as a thinking/loading indicator.
 *
 *    .-.
 *   (^_^)
 *   ╰──╯
 *   ╎╎╎╎   ← animated legs
 */

const FRAMES = [
  // Frame 0: standing
  `   .-.
  (^_^)
  ╰──╯
  ╎╎╎╎`,
  // Frame 1: left step
  `   .-.
  (^_^)
  ╰──╯
 ╱╎╎╎`,
  // Frame 2: standing (alt eyes)
  `   .-.
  (o_o)
  ╰──╯
  ╎╎╎╎`,
  // Frame 3: right step
  `   .-.
  (^_^)
  ╰──╯
  ╎╎╎╲`,
  // Frame 4: bounce
  `   .-.
  (>_<)
   ╰──╯
  ╎╎╎╎`,
  // Frame 5: standing happy
  `   .-.
  (^_^)
  ╰──╯
  ╎╎╎╎`,
];

// Compact single-line spinner frames for inline use
const INLINE_FRAMES = [
  "(^_^)",
  "(^.^)",
  "(o_o)",
  "(^.^)",
  "(^_^)",
  "(>.<)",
];

interface RueSpinnerProps {
  /** Use multiline (block) mode for the full character, or inline for single-line */
  mode?: "inline" | "block";
}

export function RueSpinner({ mode = "inline" }: RueSpinnerProps) {
  const [frame, setFrame] = useState(0);
  const frames = mode === "block" ? FRAMES : INLINE_FRAMES;

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, mode === "block" ? 300 : 400);
    return () => clearInterval(interval);
  }, [frames.length, mode]);

  if (mode === "block") {
    return <Text color="cyan">{frames[frame]}</Text>;
  }

  return <Text color="cyan">{frames[frame]}</Text>;
}
