import { Box, Text } from "ink";

interface StatusBarProps {
  agentCount: number;
  isLoading: boolean;
  totalCost: number;
  width: number;
}

export function StatusBar({ agentCount, isLoading, totalCost, width }: StatusBarProps) {
  return (
    <Box paddingX={2} justifyContent="space-between" width={width}>
      <Box>
        <Text color="#E8B87A" bold>rue</Text>
        <Text color="#6B6560"> v0.1.0</Text>
        <Text color="#4A3F35"> | </Text>
        {isLoading ? (
          <Text color="#D4956B">working</Text>
        ) : (
          <Text color="#8BA87A">ready</Text>
        )}
      </Box>

      <Box>
        {agentCount > 0 && (
          <>
            <Text color="#D4956B">{agentCount} agent{agentCount !== 1 ? "s" : ""}</Text>
            <Text color="#4A3F35"> | </Text>
          </>
        )}
        {totalCost > 0 && (
          <>
            <Text color="#6B6560">${totalCost.toFixed(2)}</Text>
            <Text color="#4A3F35"> | </Text>
          </>
        )}
        <Text color="#6B6560">/help</Text>
        <Text color="#4A3F35"> | </Text>
        <Text color="#6B6560">ctrl+c</Text>
      </Box>
    </Box>
  );
}
