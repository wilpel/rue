import type { AgentConfig, SpawnResult } from "./types.js";

type OutputCallback = (chunk: string) => void;

export class ClaudeProcess {
  private abortController: AbortController | null = null;
  private outputCallbacks: OutputCallback[] = [];
  private _isRunning = false;
  private _output: string | undefined;
  private _sessionId: string | undefined;

  constructor(private readonly config: AgentConfig) {}

  get pid(): number | null {
    // SDK manages the subprocess internally; no direct PID access
    return this._isRunning ? -1 : null;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get output(): string | undefined {
    return this._output;
  }

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  onOutput(callback: OutputCallback): void {
    this.outputCallbacks.push(callback);
  }

  async run(): Promise<SpawnResult> {
    const startedAt = Date.now();
    this._isRunning = true;
    this.abortController = new AbortController();

    try {
      // Dynamic import to allow mocking in tests
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      const q = query({
        prompt: this.config.task,
        options: {
          cwd: this.config.workdir,
          systemPrompt: this.config.systemPrompt,
          tools: { type: "preset", preset: "claude_code" },
          allowedTools: this.config.allowedTools ?? [
            "Read", "Write", "Edit", "Bash", "Glob", "Grep",
            "WebSearch", "WebFetch", "Agent",
          ],
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          maxTurns: this.config.maxTurns,
          maxBudgetUsd: this.config.budget,
          abortController: this.abortController,
        },
      });

      let output = "";
      let sessionId: string | undefined;
      let cost = 0;
      let numTurns = 0;
      let usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };

      for await (const message of q) {
        switch (message.type) {
          case "system": {
            if (message.subtype === "init") {
              sessionId = message.session_id;
              this._sessionId = sessionId;
            }
            break;
          }

          case "assistant": {
            // Extract text content from assistant messages
            const textBlocks = message.message.content.filter(
              (block: { type: string }) => block.type === "text",
            );
            for (const block of textBlocks) {
              const text = (block as { type: "text"; text: string }).text;
              output += text;
              for (const cb of this.outputCallbacks) {
                cb(text);
              }
            }
            break;
          }

          case "result": {
            cost = message.total_cost_usd;
            numTurns = message.num_turns;
            usage = {
              inputTokens: message.usage.input_tokens,
              outputTokens: message.usage.output_tokens,
              cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
              cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
            };

            if (message.subtype === "success") {
              output = message.result || output;
            } else {
              // Error results — append error info
              const errors = (message as { errors?: string[] }).errors ?? [];
              if (errors.length > 0) {
                output += `\n[Error: ${errors.join(", ")}]`;
              }
            }
            break;
          }
        }
      }

      this._isRunning = false;
      this._output = output;

      return {
        output,
        exitCode: 0,
        cost,
        durationMs: Date.now() - startedAt,
        sessionId,
        numTurns,
        usage,
      };
    } catch (error) {
      this._isRunning = false;
      const message = error instanceof Error ? error.message : String(error);
      this._output = message;

      return {
        output: message,
        exitCode: 1,
        cost: 0,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  kill(): void {
    if (this.abortController && this._isRunning) {
      this.abortController.abort();
      this._isRunning = false;
    }
  }

  sendInput(_text: string): void {
    // The SDK query() is prompt-based, not interactive stdin.
    // For steering, we'd need to use the V2 session API or
    // abort and re-query with accumulated context.
    // This is a no-op for now — steering is handled at the
    // supervisor level by killing and re-spawning with context.
  }
}
