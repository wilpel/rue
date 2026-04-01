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
        <Text dimColor>rue v0.1.0</Text>
        <Text dimColor> | </Text>
        {isLoading ? (
          <Text color="yellow">working</Text>
        ) : (
          <Text color="green">ready</Text>
        )}
      </Box>

      <Box>
        {agentCount > 0 && (
          <>
            <Text color="yellow">{agentCount} agent{agentCount !== 1 ? "s" : ""}</Text>
            <Text dimColor> | </Text>
          </>
        )}
        {totalCost > 0 && (
          <>
            <Text dimColor>${totalCost.toFixed(2)}</Text>
            <Text dimColor> | </Text>
          </>
        )}
        <Text dimColor>/help</Text>
        <Text dimColor> | </Text>
        <Text dimColor>ctrl+c quit</Text>
      </Box>
    </Box>
  );
}
