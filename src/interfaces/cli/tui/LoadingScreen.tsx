import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { COLORS } from "./theme.js";

const LOADING_FRAMES = [
  [
    "     .  ·  .     ",
    "   ·  .    .  ·  ",
    "  .    ◦    .    ",
    "   ·  .    .  ·  ",
    "     .  ·  .     ",
  ],
  [
    "    .   ·   .    ",
    "  ·   .    .   · ",
    " .     ●     .   ",
    "  ·   .    .   · ",
    "    .   ·   .    ",
  ],
  [
    "   .    ·    .   ",
    " ·    .    .    ·",
    ".      ◉      .  ",
    " ·    .    .    ·",
    "   .    ·    .   ",
  ],
  [
    "  .     ·     .  ",
    "·     .    .     ",
    "       ✦         ",
    "·     .    .     ",
    "  .     ·     .  ",
  ],
  [
    "   .    ·    .   ",
    " ·    .    .    ·",
    ".      ◉      .  ",
    " ·    .    .    ·",
    "   .    ·    .   ",
  ],
  [
    "    .   ·   .    ",
    "  ·   .    .   · ",
    " .     ●     .   ",
    "  ·   .    .   · ",
    "    .   ·   .    ",
  ],
];

interface LoadingScreenProps {
  height: number;
  width: number;
}

export function LoadingScreen({ height, width }: LoadingScreenProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % LOADING_FRAMES.length);
    }, 300);
    return () => clearInterval(timer);
  }, []);

  const art = LOADING_FRAMES[frame];
  const topPadding = Math.max(0, Math.floor((height - art.length - 3) / 2));

  return (
    <Box flexDirection="column" height={height} width={width} alignItems="center">
      <Box height={topPadding} />
      {art.map((line, i) => (
        <Text key={i} color={COLORS.primary}>{line}</Text>
      ))}
      <Box marginTop={1}>
        <Text color={COLORS.primary} bold>rue</Text>
        <Text color={COLORS.dimmed}> waking up...</Text>
      </Box>
    </Box>
  );
}
