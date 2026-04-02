import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";
import { COLORS } from "./theme.js";

let highlightFn: ((code: string, opts?: { language?: string }) => string) | null = null;
try {
  const mod = await import("cli-highlight");
  highlightFn = mod.highlight;
} catch { /* syntax highlighting unavailable */ }

function createMarked(width: number): Marked {
  const instance = new Marked();
  instance.use(
    markedTerminal({
      codespan: (text: string) => chalk.hex(COLORS.primary).bgHex(COLORS.codeBg)(` ${text} `),
      strong: (text: string) => chalk.hex(COLORS.strongText).bold(text),
      em: (text: string) => chalk.hex(COLORS.emText).italic(text),
      heading: (text: string) => "\n" + chalk.hex(COLORS.primary).bold(text),
      blockquote: (text: string) => chalk.hex(COLORS.quoteText)(`  | ${text}`),
      link: (href: string, _title: string, text: string) => `${text} ${chalk.hex(COLORS.secondary).underline(`(${href})`)}`,
      list: (body: string) => "\n" + body,
      listitem: (text: string) => {
        const clean = text.replace(/^\s*[*\-\u2022]\s*/, "").trim();
        return `  ${chalk.hex(COLORS.primary)("\u2022")} ${clean}\n`;
      },
      tab: 2,
      width,
      reflowText: true,
      showSectionPrefix: false,
    } as any), // marked-terminal types are incomplete
  );
  return instance;
}

let currentWidth = 100;
let marked = createMarked(currentWidth);

export function renderMarkdown(text: string, width?: number): string {
  if (width && width !== currentWidth) {
    currentWidth = width;
    marked = createMarked(width);
  }
  try {
    // Extract code blocks, replace with placeholders
    const codeBlocks: Array<{ lang: string; code: string }> = [];
    const withPlaceholders = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
      codeBlocks.push({ lang, code: code.trimEnd() });
      return `\n%%CODE_${codeBlocks.length - 1}%%\n`;
    });

    let rendered = marked.parse(withPlaceholders) as string;

    // Replace placeholders with syntax-highlighted code (no box, just highlighted inline)
    for (let i = 0; i < codeBlocks.length; i++) {
      rendered = rendered.replace(`%%CODE_${i}%%`, renderCodeInline(codeBlocks[i].lang, codeBlocks[i].code));
    }

    return rendered
      .replace(/^(\s*)\*\s+(\u2022)/gm, "$1$2")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return text;
  }
}

function renderCodeInline(lang: string, code: string): string {
  let highlighted: string;
  if (highlightFn && lang) {
    try {
      highlighted = highlightFn(code, { language: lang });
    } catch {
      highlighted = chalk.hex(COLORS.codeText)(code);
    }
  } else {
    highlighted = chalk.hex(COLORS.codeText)(code);
  }

  return "\n" + highlighted + "\n";
}
