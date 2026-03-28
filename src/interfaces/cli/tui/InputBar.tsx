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

  if (isLoading) {
    return (
      <Box paddingX={1}>
        <Text dimColor>waiting for response...</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>{">"} </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder="Type a message..."
      />
    </Box>
  );
}
