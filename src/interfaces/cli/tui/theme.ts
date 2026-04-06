// Dusk — warm purples and soft golds
export const COLORS = {
  primary: "#C4A7E7",     // soft lavender
  secondary: "#E0A46E",   // warm gold
  success: "#9CCE6A",     // lime green
  info: "#7DAEA3",        // sage teal
  urgent: "#EA6962",      // soft coral
  dimmed: "#928374",      // warm gray
  veryDim: "#5A524C",     // brown gray
  border: "#3C3836",      // charcoal
  codeBg: "#1D2021",      // near black
  codeText: "#D4BE98",    // tan
  strongText: "#DFDAD4",  // warm white
  emText: "#D3869B",      // dusty rose
  quoteText: "#7C6F64",   // muted brown
} as const;

export const LAYOUT = {
  chromeHeight: 6,
  minContentHeight: 8,
  sidebarBreakpoint: 90,
  minSidebarWidth: 28,
  sidebarRatio: 0.3,
  agentPanelRatio: 0.2,
  taskPanelRatio: 0.2,
  usagePanelRatio: 0.25,
  minPanelHeight: 3,
  minUsagePanelHeight: 5,
  maxEvents: 50,
  usageHistoryMax: 100,
  taskPollIntervalMs: 3000,
  tokenSampleIntervalMs: 5000,
  completedAgentLingerMs: 3000,
  failedAgentLingerMs: 5000,
  reconnectBaseMs: 1000,
  reconnectMaxMs: 30000,
  pingIntervalMs: 30000,
  pongTimeoutMs: 10000,
  requestTimeoutMs: 60000,
  charsPerToken: 3.5,
} as const;
