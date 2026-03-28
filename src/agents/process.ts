import { spawn, type ChildProcess } from "node:child_process";
import type { AgentConfig, SpawnResult } from "./types.js";

type OutputCallback = (chunk: string) => void;

export class ClaudeProcess {
  private process: ChildProcess | null = null;
  private outputCallbacks: OutputCallback[] = [];
  private _isRunning = false;
  private _output = "";

  constructor(private readonly config: AgentConfig) {}

  get pid(): number | null {
    return this.process?.pid ?? null;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  onOutput(callback: OutputCallback): void {
    this.outputCallbacks.push(callback);
  }

  async run(): Promise<SpawnResult> {
    const startedAt = Date.now();
    this._isRunning = true;

    const args = this.buildArgs();
    this.process = spawn("claude", args, {
      cwd: this.config.workdir,
      env: {
        ...process.env,
        CLAUDE_SYSTEM_PROMPT: this.config.systemPrompt,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    return new Promise<SpawnResult>((resolve, reject) => {
      const proc = this.process!;
      let output = "";

      proc.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        for (const cb of this.outputCallbacks) {
          cb(chunk);
        }
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        for (const cb of this.outputCallbacks) {
          cb(chunk);
        }
      });

      const timer = setTimeout(() => {
        this.kill();
        reject(new Error(`Agent ${this.config.id} timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);

      proc.on("close", (code, _signal) => {
        clearTimeout(timer);
        this._isRunning = false;
        this._output = output;
        resolve({
          output,
          exitCode: code,
          cost: 0,
          durationMs: Date.now() - startedAt,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        this._isRunning = false;
        reject(err);
      });
    });
  }

  kill(): void {
    if (this.process && this._isRunning) {
      this.process.kill("SIGTERM");
    }
  }

  sendInput(text: string): void {
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(text + "\n");
    }
  }

  private buildArgs(): string[] {
    const args = ["--print", this.config.task];

    if (this.config.allowedTools?.length) {
      args.push("--allowedTools", this.config.allowedTools.join(","));
    }

    if (this.config.maxTurns) {
      args.push("--max-turns", String(this.config.maxTurns));
    }

    return args;
  }
}
