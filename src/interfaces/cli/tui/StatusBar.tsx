import { Box, Text } from "ink";
import { COLORS } from "./theme.js";

interface StatusBarProps {
  agentCount: number;
  isLoading: boolean;
  totalCost: number;
  width: number;
  connectionState: "connected" | "reconnecting" | "disconnected";
}

export function StatusBar({ agentCount, isLoading, totalCost, width, connectionState }: StatusBarProps) {
  return (
    <Box paddingX={2} justifyContent="space-between" width={width}>
      <Box>
        <Text color={COLORS.primary} bold>rue</Text>
        <Text color={COLORS.dimmed}> v0.1.0</Text>
        <Text color={COLORS.veryDim}> | </Text>
        {connectionState === "reconnecting" ? (
          <Text color={COLORS.secondary}>reconnecting</Text>
        ) : connectionState === "disconnected" ? (
          <Text color={COLORS.urgent}>disconnected</Text>
        ) : isLoading ? (
          <Text color={COLORS.secondary}>working</Text>
        ) : (
          <Text color={COLORS.success}>ready</Text>
        )}
      </Box>

      <Box>
        {agentCount > 0 && (
          <>
            <Text color={COLORS.secondary}>{agentCount} agent{agentCount !== 1 ? "s" : ""}</Text>
            <Text color={COLORS.veryDim}> | </Text>
          </>
        )}
        {totalCost > 0 && (
          <>
            <Text color={COLORS.dimmed}>${totalCost.toFixed(2)}</Text>
            <Text color={COLORS.veryDim}> | </Text>
          </>
        )}
        <Text color={COLORS.dimmed}>/help</Text>
        <Text color={COLORS.veryDim}> | </Text>
        <Text color={COLORS.dimmed}>ctrl+c</Text>
      </Box>
    </Box>
  );
}
