import { parse } from "@babel/parser";
import type {
  CallExpression,
  Expression,
  Node,
  ObjectExpression,
  VariableDeclaration,
  VariableDeclarator,
} from "@babel/types";
import {
  emitThemeCss,
  themeHandles,
  type Theme,
  type ThemeColors,
  type ThemeDefinition,
} from "./theme.js";

export type ThemeAnalyzeHit = {
  start: number;
  end: number;
  kind: "static" | "dynamic";
  theme?: ThemeDefinition;
  error?: string;
};

const evalLiteral = (
  node: Expression
): string | number | boolean | null | undefined => {
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "NumericLiteral") return node.value;
  if (node.type === "BooleanLiteral") return node.value;
  if (node.type === "NullLiteral") return null;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis.map((q) => q.value.cooked ?? "").join("");
  }
  return undefined;
};

const isDefineThemeCallee = (node: CallExpression["callee"]): boolean => {
  if (node.type === "Identifier") return node.name === "defineTheme";
  if (node.type === "MemberExpression" && !node.computed) {
    return (
      node.property.type === "Identifier" &&
      node.property.name === "defineTheme"
    );
  }
  return false;
};

const walk = (node: Node, visit: (n: Node) => void) => {
  visit(node);
  for (const key of Object.keys(node)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "leadingComments" ||
      key === "innerComments" ||
      key === "trailingComments"
    ) {
      continue;
    }
    const child = (node as unknown as Record<string, unknown>)[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in (item as object)) {
          walk(item as Node, visit);
        }
      }
    } else if (typeof child === "object" && "type" in (child as object)) {
      walk(child as Node, visit);
    }
  }
};

const collectConstObjectBindings = (
  ast: Node
): Map<string, ObjectExpression> => {
  const bindings = new Map<string, ObjectExpression>();
  walk(ast, (node) => {
    if (node.type !== "VariableDeclaration") return;
    const decl = node as VariableDeclaration;
    if (decl.kind !== "const") return;
    for (const d of decl.declarations as VariableDeclarator[]) {
      if (d.id.type !== "Identifier") continue;
      if (!d.init || d.init.type !== "ObjectExpression") continue;
      bindings.set(d.id.name, d.init);
    }
  });
  return bindings;
};

const evalColorMap = (
  node: ObjectExpression
): { ok: true; value: ThemeColors } | { ok: false; error: string } => {
  const out: ThemeColors = {};
  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      return { ok: false, error: "SpreadElement is not allowed in defineTheme" };
    }
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return { ok: false, error: "defineTheme color keys must be static" };
    }
    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "StringLiteral"
          ? prop.key.value
          : null;
    if (!key) return { ok: false, error: "Unsupported color key" };
    const lit = evalLiteral(prop.value as Expression);
    if (typeof lit !== "string") {
      return {
        ok: false,
        error: `defineTheme color "${key}" must be a string literal (e.g. "oklch(...)")`,
      };
    }
    out[key] = lit;
  }
  return { ok: true, value: out };
};

export const evalThemeDefinitionNode = (
  node: ObjectExpression
): { ok: true; theme: ThemeDefinition } | { ok: false; error: string } => {
  let light: ThemeColors | undefined;
  let dark: ThemeColors | undefined;
  let defaultTheme: Theme | undefined;

  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      return { ok: false, error: "SpreadElement is not allowed in defineTheme" };
    }
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return { ok: false, error: "defineTheme keys must be static" };
    }
    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "StringLiteral"
          ? prop.key.value
          : null;
    if (!key) return { ok: false, error: "Unsupported defineTheme key" };

    if (key === "defaultTheme") {
      const lit = evalLiteral(prop.value as Expression);
      if (lit !== "light" && lit !== "dark") {
        return {
          ok: false,
          error: 'defaultTheme must be "light" or "dark"',
        };
      }
      defaultTheme = lit;
      continue;
    }

    if (key === "light" || key === "dark") {
      if (prop.value.type !== "ObjectExpression") {
        return { ok: false, error: `${key} must be an object` };
      }
      const map = evalColorMap(prop.value);
      if (!map.ok) return map;
      if (key === "light") light = map.value;
      else dark = map.value;
      continue;
    }

    return { ok: false, error: `Unknown defineTheme key "${key}"` };
  }

  if (!light) return { ok: false, error: "defineTheme requires light: { ... }" };
  return {
    ok: true,
    theme: {
      defaultTheme,
      light,
      dark,
    },
  };
};

const analyzeDefineThemeCall = (
  call: CallExpression,
  constObjects: Map<string, ObjectExpression>
): ThemeAnalyzeHit => {
  const start = call.start ?? 0;
  const end = call.end ?? start;
  const arg = call.arguments[0];

  if (!arg) {
    return {
      start,
      end,
      kind: "dynamic",
      error: "defineTheme() requires a static config object",
    };
  }
  if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder") {
    return {
      start,
      end,
      kind: "dynamic",
      error: "Spread arguments are not allowed in static defineTheme()",
    };
  }

  let node: ObjectExpression | null = null;
  if (arg.type === "ObjectExpression") node = arg;
  else if (arg.type === "Identifier") {
    node = constObjects.get(arg.name) ?? null;
  }

  if (!node) {
    return {
      start,
      end,
      kind: "dynamic",
      error:
        "defineTheme() config must be an inline object or same-file const object literal",
    };
  }

  const evaluated = evalThemeDefinitionNode(node);
  if (!evaluated.ok) {
    return { start, end, kind: "dynamic", error: evaluated.error };
  }
  return { start, end, kind: "static", theme: evaluated.theme };
};

/** Finds static defineTheme() calls for Vite CSS extraction. */
export const analyzeDefineThemeCalls = (code: string): ThemeAnalyzeHit[] => {
  if (!/\bdefineTheme\s*\(/.test(code)) return [];

  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const constObjects = collectConstObjectBindings(ast);
  const hits: ThemeAnalyzeHit[] = [];
  const seen = new Set<string>();

  walk(ast, (node) => {
    if (node.type !== "CallExpression") return;
    const call = node as CallExpression;
    if (!isDefineThemeCallee(call.callee)) return;
    const key = `${call.start ?? 0}:${call.end ?? 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(analyzeDefineThemeCall(call, constObjects));
  });

  return hits;
};

/**
 * Point `defineTheme` imports at defineThemeColors (no CSS inject) for Vite.
 */
export const rewriteDefineThemeImports = (code: string): string =>
  code.replace(
    /import\s*\{([^}]*)\}\s*from\s*(["'])(som-style(?:\/solid)?)\2/g,
    (full, specs: string, quote: string, source: string) => {
      if (/\bdefineThemeColors\s+as\s+defineTheme\b/.test(specs)) return full;
      if (!/\bdefineTheme\b/.test(specs)) return full;
      const next = specs.replace(
        /\bdefineTheme\b/g,
        "defineThemeColors as defineTheme"
      );
      return `import {${next}} from ${quote}${source}${quote}`;
    }
  );

export type TransformThemeResult = {
  code: string;
  css: string;
};

/** Extract defineTheme() CSS and rewire imports to defineThemeColors. */
export const transformThemeForBuild = (
  code: string,
  fileId: string
): TransformThemeResult => {
  const hits = analyzeDefineThemeCalls(code);
  if (hits.length === 0) {
    return { code, css: "" };
  }

  for (const hit of hits) {
    if (hit.kind === "dynamic") {
      throw new Error(
        `[som-style] ${fileId}: static theme extraction failed. ${hit.error ?? "Use a static defineTheme({ light: { ... } }) literal."}`.trim()
      );
    }
  }

  const css = hits
    .map((h) => (h.theme ? emitThemeCss(h.theme) : ""))
    .filter(Boolean)
    .join("\n");

  return { code: rewriteDefineThemeImports(code), css };
};

/**
 * If `export const name = defineTheme(...)`, return flat handle map
 * (`theme.text` → var(--som-theme-text)).
 */
export const evalExportedThemeHandles = (
  code: string,
  exportName: string
): ThemeColors | null => {
  const re = new RegExp(
    `export\\s+const\\s+${exportName}\\s*=\\s*defineTheme\\s*\\(`
  );
  if (!re.test(code)) return null;
  const hit = analyzeDefineThemeCalls(code).find(
    (h) => h.kind === "static" && h.theme
  );
  return hit?.theme ? themeHandles(hit.theme) : null;
};
