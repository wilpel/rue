import React from "react";
import { Box, Text } from "ink";
import { COLORS } from "./theme.js";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Box flexDirection="column" padding={2}>
          <Text color={COLORS.urgent} bold>rue crashed</Text>
          <Text color={COLORS.dimmed}>{this.state.error.message}</Text>
          <Box marginTop={1}>
            <Text color={COLORS.veryDim}>{this.state.error.stack?.split("\n").slice(1, 5).join("\n")}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={COLORS.dimmed}>Press ctrl+c to exit</Text>
          </Box>
        </Box>
      );
    }
    return this.props.children;
  }
}
