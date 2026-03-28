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
          includePartialMessages: true,
        },
      });

      let streamedText = "";
      let sessionId: string | undefined;
      let cost = 0;
      let numTurns = 0;
      let usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };

      for await (const message of q) {
        switch (message.type) {
          case "system": {
            if ((message as { subtype?: string }).subtype === "init") {
              sessionId = (message as { session_id: string }).session_id;
              this._sessionId = sessionId;
            }
            break;
          }

          case "stream_event": {
            // Partial streaming events — token by token
            const event = (message as { event?: { type?: string; delta?: { type?: string; text?: string } } }).event;
            if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
              const text = event.delta.text;
              streamedText += text;
              for (const cb of this.outputCallbacks) {
                cb(text);
              }
            }
            break;
          }

          case "assistant": {
            // Full assistant message — extract text for non-streaming fallback
            const content = (message as { message: { content: Array<{ type: string; text?: string }> } }).message.content;
            const textBlocks = content.filter((b) => b.type === "text");
            const fullText = textBlocks.map((b) => b.text ?? "").join("");

            // If we didn't get streaming events, emit the full text
            if (!streamedText && fullText) {
              streamedText = fullText;
              for (const cb of this.outputCallbacks) {
                cb(fullText);
              }
            }
            break;
          }

          case "result": {
            const resultMsg = message as {
              subtype: string;
              total_cost_usd: number;
              num_turns: number;
              result?: string;
              errors?: string[];
              usage: {
                input_tokens: number;
                output_tokens: number;
                cache_read_input_tokens?: number;
                cache_creation_input_tokens?: number;
              };
            };
            cost = resultMsg.total_cost_usd;
            numTurns = resultMsg.num_turns;
            usage = {
              inputTokens: resultMsg.usage.input_tokens,
              outputTokens: resultMsg.usage.output_tokens,
              cacheReadInputTokens: resultMsg.usage.cache_read_input_tokens ?? 0,
              cacheCreationInputTokens: resultMsg.usage.cache_creation_input_tokens ?? 0,
            };

            if (resultMsg.subtype === "success" && resultMsg.result) {
              // Use result text if we somehow missed streaming
              if (!streamedText) {
                streamedText = resultMsg.result;
                for (const cb of this.outputCallbacks) {
                  cb(resultMsg.result!);
                }
              }
            } else if (resultMsg.subtype !== "success") {
              const errors = resultMsg.errors ?? [];
              if (errors.length > 0) {
                const errText = `\n[Error: ${errors.join(", ")}]`;
                streamedText += errText;
                for (const cb of this.outputCallbacks) {
                  cb(errText);
                }
              }
            }
            break;
          }
        }
      }

      const finalOutput = streamedText;
      this._isRunning = false;
      this._output = finalOutput;

      return {
        output: finalOutput,
        exitCode: 0,
        cost,
        durationMs: Date.now() - startedAt,
        sessionId,
        numTurns,
        usage,
      };
    } catch (error) {
      this._isRunning = false;
      const errMsg = error instanceof Error ? error.message : String(error);
      this._output = errMsg;

      return {
        output: errMsg,
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
    // SDK query() is prompt-based. Steering is handled at supervisor level.
  }
}
