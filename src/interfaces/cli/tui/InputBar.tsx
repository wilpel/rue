import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

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

  return (
    <Box
      borderStyle="round"
      borderColor={isLoading ? "#D4956B" : "#E8B87A"}
      paddingX={1}
      marginX={1}
    >
      <Text color={isLoading ? "#D4956B" : "#E8B87A"} bold>{">"} </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={isLoading ? "waiting for response..." : "message rue..."}
      />
    </Box>
  );
}
