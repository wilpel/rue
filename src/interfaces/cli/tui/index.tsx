import { render } from "ink";
import { App } from "./App.js";
import { DaemonClient } from "../client.js";

export async function startTUI(daemonUrl: string) {
  const client = new DaemonClient(daemonUrl);

  try {
    await client.connect();
  } catch {
    console.error(
      "Could not connect to Rue daemon. Start it first: rue daemon start",
    );
    process.exit(1);
  }

  const { waitUntilExit } = render(<App client={client} />);

  await waitUntilExit();
  client.disconnect();
}
