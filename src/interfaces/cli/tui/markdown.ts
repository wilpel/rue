import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";

// Cozy warm palette
const WARM = {
  heading: chalk.hex("#E8B87A").bold,
  codeFrame: chalk.hex("#4A3F35"),
  codeLang: chalk.hex("#8BA87A"),
  codeText: chalk.hex("#C9A87C"),
  codeSpan: chalk.hex("#E8B87A"),
  blockquote: chalk.hex("#A89080"),
  link: chalk.hex("#D4956B").underline,
  strong: chalk.hex("#E8CDA0").bold,
  em: chalk.hex("#C9B89A").italic,
};

const marked = new Marked();

marked.use(
  markedTerminal({
    // Styling options for marked-terminal v7
    codespan: (text: string) => chalk.hex("#E8B87A").bgHex("#2A2520")(` ${text} `),
    strong: (text: string) => WARM.strong(text),
    em: (text: string) => WARM.em(text),
    heading: (text: string) => "\n" + WARM.heading(text),
    blockquote: (text: string) => chalk.hex("#A89080")(`  │ ${text}`),
    link: (href: string, _title: string, text: string) => `${text} ${WARM.link(`(${href})`)}`,
    list: (body: string) => "\n" + body,
    listitem: (text: string) => {
      // Strip any leading bullet/star from marked-terminal default
      const clean = text.replace(/^\s*[*\-•]\s*/, "").trim();
      return `  ${chalk.hex("#E8B87A")("•")} ${clean}\n`;
    },
    tab: 2,
    width: 100,
    reflowText: true,
    showSectionPrefix: false,
  } as any),
);

/**
 * Render markdown with code blocks as styled terminal windows.
 * marked-terminal handles basic markdown; we post-process code blocks
 * into framed windows.
 */
export function renderMarkdown(text: string): string {
  try {
    // Pre-process: extract code blocks and replace with placeholders
    const codeBlocks: Array<{ lang: string; code: string }> = [];
    const withPlaceholders = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang, code: code.trimEnd() });
      return `\n%%CODEBLOCK_${idx}%%\n`;
    });

    // Render non-code markdown
    let rendered = marked.parse(withPlaceholders) as string;

    // Replace placeholders with styled code windows
    for (let i = 0; i < codeBlocks.length; i++) {
      const { lang, code } = codeBlocks[i];
      const window = renderCodeWindow(lang, code);
      rendered = rendered.replace(`%%CODEBLOCK_${i}%%`, window);
    }

    // Clean up: remove default bullet prefix from marked-terminal, collapse blank lines
    return rendered
      .replace(/^(\s*)\*\s+(•)/gm, "$1$2")  // line-level: "  *   •" → "  •"
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return text;
  }
}

function renderCodeWindow(lang: string, code: string): string {
  const lines = code.split("\n");
  const maxLen = Math.max(...lines.map(l => l.length), 30);
  const width = maxLen + 2;

  // Window chrome: colored dots + language label
  const dots = chalk.hex("#C47070")("●") + " " + chalk.hex("#D4956B")("●") + " " + chalk.hex("#8BA87A")("●");
  const langLabel = lang ? ` ${lang} ` : " ";
  const padLen = Math.max(0, width - 6 - langLabel.length);
  const topLine = `  ${dots}${WARM.codeLang(langLabel)}${WARM.codeFrame("─".repeat(padLen))}`;

  // Code lines with left border
  const bodyLines = lines.map(l => {
    const padded = l.padEnd(maxLen);
    return `  ${WARM.codeFrame("│")} ${WARM.codeText(padded)} ${WARM.codeFrame("│")}`;
  });

  // Bottom border
  const bottomLine = `  ${WARM.codeFrame("╰" + "─".repeat(width) + "╯")}`;

  return "\n" + topLine + "\n" + bodyLines.join("\n") + "\n" + bottomLine;
}

export { WARM };
