import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface StatusBarProps {
  agentCount: number;
  isLoading: boolean;
}

export function StatusBar({ agentCount, isLoading }: StatusBarProps) {
  return (
    <Box paddingX={1} justifyContent="space-between">
      <Box>
        {isLoading ? (
          <Box>
            <Spinner type="dots" />
            <Text color="yellow"> working</Text>
          </Box>
        ) : (
          <Text dimColor>ready</Text>
        )}
      </Box>
      {agentCount > 0 && (
        <Box>
          <Text color="yellow">{agentCount} agent{agentCount !== 1 ? "s" : ""} active</Text>
        </Box>
      )}
    </Box>
  );
}
