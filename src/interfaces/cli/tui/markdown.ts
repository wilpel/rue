import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";

// Cozy warm palette
const WARM = {
  heading: chalk.hex("#E8B87A").bold,
  code: chalk.hex("#C9A87C"),
  codeFrame: chalk.hex("#4A3F35"),
  codeLang: chalk.hex("#6B6560"),
  codeText: chalk.hex("#C9A87C"),
  codeSpan: chalk.hex("#E8B87A").bgHex("#2A2520"),
  blockquote: chalk.hex("#A89080"),
  link: chalk.hex("#D4956B").underline,
  strong: chalk.hex("#E8CDA0").bold,
  em: chalk.hex("#C9B89A").italic,
  listItem: chalk.hex("#B8A080"),
  hr: chalk.hex("#4A3F35"),
  text: chalk.hex("#D4C4B0"),
};

const marked = new Marked();

marked.use(
  markedTerminal({
    code: (code: string, lang?: string) => {
      const lines = code.split("\n");
      const maxLen = Math.max(...lines.map(l => l.length), 30);
      const width = maxLen + 4;

      // Window chrome
      const langLabel = lang ? ` ${lang} ` : "";
      const dots = WARM.codeFrame("  ") + chalk.hex("#C47070")("●") + " " + chalk.hex("#D4956B")("●") + " " + chalk.hex("#8BA87A")("●");
      const topBar = dots + WARM.codeLang(langLabel) + WARM.codeFrame("─".repeat(Math.max(0, width - 10 - langLabel.length)));
      const bottomBar = WARM.codeFrame(" " + "─".repeat(width - 2) + " ");

      const body = lines.map(l => {
        const padded = l.padEnd(maxLen);
        return WARM.codeFrame(" │") + WARM.codeText(` ${padded} `) + WARM.codeFrame("│");
      });

      return "\n" + topBar + "\n" + body.join("\n") + "\n" + bottomBar + "\n";
    },
    codespan: (text: string) => WARM.codeSpan(` ${text} `),
    blockquote: (text: string) => WARM.blockquote(`  │ ${text}`),
    heading: (text: string) => "\n" + WARM.heading(text) + "\n",
    strong: (text: string) => WARM.strong(text),
    em: (text: string) => WARM.em(text),
    link: (href: string, _title: string, text: string) => `${text} ${WARM.link(`(${href})`)}`,
    hr: () => WARM.hr("─".repeat(50)),
    listitem: (text: string) => WARM.listItem(`  ${chalk.hex("#E8B87A")("•")} ${text}`),
    tab: 2,
    width: 100,
    reflowText: true,
  } as any),
);

export function renderMarkdown(text: string): string {
  try {
    const rendered = marked.parse(text) as string;
    return rendered.replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return text;
  }
}

export { WARM };
