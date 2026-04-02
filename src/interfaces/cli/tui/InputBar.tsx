import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { COLORS } from "./theme.js";

interface InputBarProps {
  onSubmit: (text: string) => void;
  isLoading: boolean;
}

export function InputBar({ onSubmit, isLoading }: InputBarProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (text: string) => {
    if (!text.trim()) return;
    onSubmit(text);
    setValue("");
  };

  const borderColor = isLoading ? COLORS.secondary : COLORS.primary;

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      marginX={1}
    >
      <Text color={borderColor} bold>{">"} </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={isLoading ? "waiting for response..." : "message rue..."}
      />
    </Box>
  );
}
