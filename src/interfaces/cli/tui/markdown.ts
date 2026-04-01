import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";

let highlightFn: ((code: string, opts?: { language?: string }) => string) | null = null;
try {
  const mod = await import("cli-highlight");
  highlightFn = mod.highlight;
} catch { /* syntax highlighting unavailable */ }

const marked = new Marked();

marked.use(
  markedTerminal({
    codespan: (text: string) => chalk.hex("#E8B87A").bgHex("#2A2520")(` ${text} `),
    strong: (text: string) => chalk.hex("#E8CDA0").bold(text),
    em: (text: string) => chalk.hex("#C9B89A").italic(text),
    heading: (text: string) => "\n" + chalk.hex("#E8B87A").bold(text),
    blockquote: (text: string) => chalk.hex("#A89080")(`  │ ${text}`),
    link: (href: string, _title: string, text: string) => `${text} ${chalk.hex("#D4956B").underline(`(${href})`)}`,
    list: (body: string) => "\n" + body,
    listitem: (text: string) => {
      const clean = text.replace(/^\s*[*\-•]\s*/, "").trim();
      return `  ${chalk.hex("#E8B87A")("•")} ${clean}\n`;
    },
    tab: 2,
    width: 100,
    reflowText: true,
    showSectionPrefix: false,
  } as any),
);

export function renderMarkdown(text: string): string {
  try {
    // Extract code blocks, replace with placeholders
    const codeBlocks: Array<{ lang: string; code: string }> = [];
    const withPlaceholders = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
      codeBlocks.push({ lang, code: code.trimEnd() });
      return `\n%%CODE_${codeBlocks.length - 1}%%\n`;
    });

    // Render markdown (without code blocks)
    let rendered = marked.parse(withPlaceholders) as string;

    // Replace placeholders with styled code blocks
    for (let i = 0; i < codeBlocks.length; i++) {
      rendered = rendered.replace(`%%CODE_${i}%%`, renderCodeBlock(codeBlocks[i].lang, codeBlocks[i].code));
    }

    return rendered
      .replace(/^(\s*)\*\s+(•)/gm, "$1$2")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return text;
  }
}

function renderCodeBlock(lang: string, code: string): string {
  let highlighted: string;
  if (highlightFn && lang) {
    try {
      highlighted = highlightFn(code, { language: lang });
    } catch {
      highlighted = chalk.hex("#C9A87C")(code);
    }
  } else {
    highlighted = chalk.hex("#C9A87C")(code);
  }

  const bg = chalk.bgHex("#1E1B18");
  const dim = chalk.hex("#4A3F35");
  const langLabel = lang ? dim(`  ${lang}`) : "";

  const lines = highlighted.split("\n");
  const body = lines.map(l => bg(`  ${l}  `));

  return "\n" + langLabel + "\n" + body.join("\n") + "\n";
}

