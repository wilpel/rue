import { Box, Text } from "ink";

interface StatusBarProps {
  totalCost: number;
  agentCount: number;
  isLoading: boolean;
}

export function StatusBar({ totalCost, agentCount, isLoading }: StatusBarProps) {
  return (
    <Box paddingX={1} justifyContent="space-between">
      <Box>
        <Text dimColor>
          agents: {agentCount}
        </Text>
        {isLoading && (
          <Text color="yellow" dimColor>
            {" "}| processing
          </Text>
        )}
      </Box>
      <Box>
        <Text dimColor>
          cost: ${totalCost.toFixed(4)}
        </Text>
      </Box>
    </Box>
  );
}
