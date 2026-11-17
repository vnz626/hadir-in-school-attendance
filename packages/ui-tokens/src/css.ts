import {
  baseColors,
  fontStack,
  motion,
  noneStatus,
  radius,
  shadow,
  spacing,
  statusColors,
  typeScale,
} from "./tokens";

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/**
 * Berkas CSS yang dibangkitkan dari token: variabel `:root` (Rancangan §22.1) dan blok
 * `@theme inline` Tailwind 4 yang memetakan variabel itu menjadi kelas utilitas.
 */
export function buildTokensCss(): string {
  const root: string[] = [];
  for (const [k, v] of Object.entries(baseColors)) root.push(`  --c-${kebab(k)}: ${v};`);
  for (const [k, p] of Object.entries(statusColors)) {
    root.push(`  --s-${k}: ${p.solid};`, `  --s-${k}-bg: ${p.bg};`, `  --s-${k}-fg: ${p.fg};`);
  }
  root.push(
    "  --s-none: transparent;",
    `  --s-none-border: ${noneStatus.border};`,
    `  --s-none-bg: ${noneStatus.bg};`,
    `  --s-none-fg: ${noneStatus.fg};`,
  );
  for (const [k, v] of Object.entries(radius)) root.push(`  --r-${k}: ${v};`);
  for (const [k, v] of Object.entries(spacing)) root.push(`  --sp-${k}: ${v};`);
  root.push(
    `  --shadow-float: ${shadow.float};`,
    `  --ease-out: ${motion.easeOut};`,
    `  --dur-fast: ${motion.durFast};`,
    `  --dur-base: ${motion.durBase};`,
  );

  const theme: string[] = [
    "  --color-*: initial;",
    "  --color-transparent: transparent;",
    "  --color-white: var(--c-surface);",
  ];
  for (const k of Object.keys(baseColors))
    theme.push(`  --color-${kebab(k)}: var(--c-${kebab(k)});`);
  for (const k of Object.keys(statusColors)) {
    theme.push(
      `  --color-status-${k}: var(--s-${k});`,
      `  --color-status-${k}-bg: var(--s-${k}-bg);`,
      `  --color-status-${k}-fg: var(--s-${k}-fg);`,
    );
  }
  theme.push(
    "  --color-status-none-border: var(--s-none-border);",
    "  --color-status-none-bg: var(--s-none-bg);",
    "  --color-status-none-fg: var(--s-none-fg);",
  );
  theme.push("  --radius-*: initial;");
  for (const k of Object.keys(radius)) theme.push(`  --radius-${k}: var(--r-${k});`);
  theme.push("  --font-sans: var(--font-sans-stack);", "  --shadow-float: var(--shadow-float);");
  for (const [k, t] of Object.entries(typeScale)) {
    theme.push(
      `  --text-${k}: ${t.size};`,
      `  --text-${k}--line-height: ${t.line};`,
      `  --text-${k}--letter-spacing: ${t.tracking};`,
      `  --text-${k}--font-weight: ${t.weight};`,
    );
  }

  return [
    "/* DIBANGKITKAN dari packages/ui-tokens/src/tokens.ts. Jangan diedit tangan. */",
    ":root {",
    ...root,
    `  --font-sans-stack: ${fontStack};`,
    "}",
    "",
    "@theme inline {",
    ...theme,
    "}",
    "",
    "html { color: var(--c-ink); background: var(--c-paper); }",
    "body { font-size: 16px; line-height: 24px; font-variant-numeric: tabular-nums; }",
    "",
    "@media (prefers-reduced-motion: reduce) {",
    "  *, *::before, *::after { animation: none !important; transition-duration: 0.01ms !important; }",
    "}",
    "",
  ].join("\n");
}
