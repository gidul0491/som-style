import { parse } from "@babel/parser";
import type {
  CallExpression,
  Expression,
  Node,
  ObjectExpression,
  VariableDeclaration,
  VariableDeclarator,
} from "@babel/types";
import { mergeResponsiveOptions } from "./extendStyle.js";
import { evalRecipeConfigNode } from "./recipeStatic.js";
import type { RecipeConfig } from "./recipeExpand.js";
import type { ResponsiveStyleOptions, StyleObject } from "./types.js";

export type AnalyzeHit = {
  start: number;
  end: number;
  kind: "static" | "dynamic" | "variants" | "recipe";
  options?: ResponsiveStyleOptions;
  /** Present when kind === "variants" */
  variantMap?: Record<string, ResponsiveStyleOptions>;
  /** Present when kind === "recipe" */
  recipeConfig?: RecipeConfig;
  error?: string;
};

export type AnalyzeExtras = {
  /** Local name → options resolved from another module's exported object literal */
  externalOptions?: Map<string, ResponsiveStyleOptions>;
  /**
   * Local binding → string token map (from project constant.js or same-file const).
   * Any export name is allowed; values are used as-is for static extract.
   */
  tokenMaps?: Map<string, Record<string, string>>;
};

/** Active during analyzeStyleCalls — any constant.js export name resolves here first. */
let activeTokenMaps: Map<string, Record<string, string>> = new Map();

const isStyleCallee = (node: CallExpression["callee"]): boolean => {
  if (node.type === "Identifier") return node.name === "style";
  if (node.type === "MemberExpression" && !node.computed) {
    return (
      node.property.type === "Identifier" && node.property.name === "style"
    );
  }
  return false;
};

const isVariantsCallee = (node: CallExpression["callee"]): boolean => {
  if (node.type === "Identifier") return node.name === "variants";
  if (node.type === "MemberExpression" && !node.computed) {
    return (
      node.property.type === "Identifier" && node.property.name === "variants"
    );
  }
  return false;
};

const isRecipeCallee = (node: CallExpression["callee"]): boolean => {
  if (node.type === "Identifier") return node.name === "recipe";
  if (node.type === "MemberExpression" && !node.computed) {
    return (
      node.property.type === "Identifier" && node.property.name === "recipe"
    );
  }
  return false;
};

const isExtendCallee = (
  node: CallExpression["callee"]
): node is CallExpression["callee"] & {
  type: "MemberExpression";
  object: Expression;
  property: { type: "Identifier"; name: "extend" };
} => {
  if (node.type !== "MemberExpression" || node.computed) return false;
  return (
    node.property.type === "Identifier" && node.property.name === "extend"
  );
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

/**
 * Resolve foo.bar to a CSS value.
 * 1) tokenMaps / constant.js
 * 2) theme.* → var(--som-theme-*)
 */
const camelToKebabCss = (str: string) =>
  str.replace(/([A-Z])/g, "-$1").toLowerCase();

const memberPropName = (node: Expression): string | undefined => {
  if (node.type !== "MemberExpression") return undefined;
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (node.computed && node.property.type === "StringLiteral") {
    return node.property.value;
  }
  if (node.computed && node.property.type === "NumericLiteral") {
    return String(node.property.value);
  }
  return undefined;
};

const tokenMemberToCssVar = (group: string, prop: string): string | undefined => {
  const fromMap = activeTokenMaps.get(group)?.[prop];
  if (fromMap != null) return fromMap;

  if (group === "theme") {
    return `var(--som-theme-${camelToKebabCss(prop)})`;
  }

  return undefined;
};

const evalTokenMember = (node: Expression): string | undefined => {
  if (node.type !== "MemberExpression") return undefined;
  if (node.object.type !== "Identifier") return undefined;
  const prop = memberPropName(node);
  if (!prop) return undefined;
  return tokenMemberToCssVar(node.object.name, prop);
};

/**
 * Values safe for Vite static extract: literals, design tokens, and
 * template strings that only interpolate those.
 */
const evalStaticValue = (
  node: Expression
): string | number | boolean | null | undefined => {
  const lit = evalLiteral(node);
  if (lit !== undefined) return lit;

  const token = evalTokenMember(node);
  if (token !== undefined) return token;

  if (node.type === "TemplateLiteral") {
    let out = "";
    for (let i = 0; i < node.quasis.length; i++) {
      out += node.quasis[i]?.value.cooked ?? "";
      const expr = node.expressions[i];
      if (!expr) continue;
      const part = evalStaticValue(expr as Expression);
      if (typeof part !== "string" && typeof part !== "number") {
        return undefined;
      }
      out += String(part);
    }
    return out;
  }

  return undefined;
};

const evalStyleObject = (
  node: ObjectExpression
): { ok: true; value: StyleObject } | { ok: false; error: string } => {
  const out: Record<string, string | number | StyleObject> = {};

  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      return {
        ok: false,
        error: "SpreadElement is not allowed in static style options",
      };
    }
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return {
        ok: false,
        error: "Only static object properties are allowed in style options",
      };
    }

    const keyNode = prop.key;
    let key: string;
    if (keyNode.type === "Identifier") key = keyNode.name;
    else if (keyNode.type === "StringLiteral") key = keyNode.value;
    else if (keyNode.type === "NumericLiteral") key = String(keyNode.value);
    else {
      return {
        ok: false,
        error: "Unsupported property key in style options",
      };
    }

    const valueNode = prop.value;
    if (valueNode.type === "ObjectExpression") {
      const nested = evalStyleObject(valueNode);
      if (!nested.ok) return nested;
      out[key] = nested.value;
      continue;
    }

    const lit = evalStaticValue(valueNode as Expression);
    if (lit === undefined) {
      return {
        ok: false,
        error: `Dynamic value for "${key}" is not allowed in static style options`,
      };
    }
    if (lit === null) continue;
    out[key] = lit as string | number | StyleObject;
  }

  return { ok: true, value: out as StyleObject };
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

const resolveOptionsArg = (
  arg: Expression,
  constObjects: Map<string, ObjectExpression>,
  externalOptions?: Map<string, ResponsiveStyleOptions>
):
  | { ok: true; node: ObjectExpression }
  | { ok: true; options: ResponsiveStyleOptions }
  | { ok: false; error: string } => {
  if (arg.type === "ObjectExpression") {
    return { ok: true, node: arg };
  }

  if (arg.type === "Identifier") {
    const bound = constObjects.get(arg.name);
    if (bound) {
      return { ok: true, node: bound };
    }
    const external = externalOptions?.get(arg.name);
    if (external) {
      return { ok: true, options: external };
    }
    return {
      ok: false,
      error: `Unknown or non-literal style object "${arg.name}". Use an inline object, a same-file const, or an imported exported object literal.`,
    };
  }

  return {
    ok: false,
    error:
      "style() / .extend() argument must be a static object literal, same-file const, or imported exported object when using the Vite plugin",
  };
};

const evalOptionsFromArg = (
  arg: Expression,
  constObjects: Map<string, ObjectExpression>,
  externalOptions?: Map<string, ResponsiveStyleOptions>
):
  | { ok: true; options: ResponsiveStyleOptions }
  | { ok: false; error: string } => {
  const resolved = resolveOptionsArg(arg, constObjects, externalOptions);
  if (!resolved.ok) return resolved;
  if ("options" in resolved) return { ok: true, options: resolved.options };

  const evaluated = evalStyleObject(resolved.node);
  if (!evaluated.ok) return evaluated;

  const options = evaluated.value as ResponsiveStyleOptions;
  if (!options.base || typeof options.base !== "object") {
    return {
      ok: false,
      error: 'static options must include a "base" object',
    };
  }
  return { ok: true, options };
};

const analyzeVariantsCall = (
  call: CallExpression,
  constObjects: Map<string, ObjectExpression>,
  externalOptions?: Map<string, ResponsiveStyleOptions>
): AnalyzeHit => {
  const start = call.start ?? 0;
  const end = call.end ?? start;
  const arg = call.arguments[0];

  if (!arg) {
    return {
      start,
      end,
      kind: "dynamic",
      error: "variants() requires a static object map",
    };
  }
  if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder") {
    return {
      start,
      end,
      kind: "dynamic",
      error: "Spread arguments are not allowed in static variants()",
    };
  }

  const resolved = resolveOptionsArg(arg, constObjects, externalOptions);
  if (!resolved.ok) {
    return { start, end, kind: "dynamic", error: resolved.error };
  }
  if (!("node" in resolved)) {
    return {
      start,
      end,
      kind: "dynamic",
      error:
        "variants() map must be an object literal or same-file const (not a style-options import)",
    };
  }

  const variantMap: Record<string, ResponsiveStyleOptions> = {};

  for (const prop of resolved.node.properties) {
    if (prop.type === "SpreadElement") {
      return {
        start,
        end,
        kind: "dynamic",
        error: "SpreadElement is not allowed in static variants()",
      };
    }
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return {
        start,
        end,
        kind: "dynamic",
        error: "variants() keys must be static identifiers or string literals",
      };
    }

    const keyNode = prop.key;
    let key: string;
    if (keyNode.type === "Identifier") key = keyNode.name;
    else if (keyNode.type === "StringLiteral") key = keyNode.value;
    else {
      return {
        start,
        end,
        kind: "dynamic",
        error: "Unsupported variants() key",
      };
    }

    if (
      prop.value.type !== "ObjectExpression" &&
      prop.value.type !== "Identifier"
    ) {
      return {
        start,
        end,
        kind: "dynamic",
        error: `variants()["${key}"] must be a static style options object`,
      };
    }

    const evaluated = evalOptionsFromArg(
      prop.value,
      constObjects,
      externalOptions
    );
    if (!evaluated.ok) {
      return { start, end, kind: "dynamic", error: evaluated.error };
    }
    variantMap[key] = evaluated.options;
  }

  return { start, end, kind: "variants", variantMap };
};

const analyzeRecipeCall = (
  call: CallExpression,
  constObjects: Map<string, ObjectExpression>
): AnalyzeHit => {
  const start = call.start ?? 0;
  const end = call.end ?? start;
  const arg = call.arguments[0];

  if (!arg) {
    return {
      start,
      end,
      kind: "dynamic",
      error: "recipe() requires a static config object",
    };
  }
  if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder") {
    return {
      start,
      end,
      kind: "dynamic",
      error: "Spread arguments are not allowed in static recipe()",
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
        "recipe() config must be an inline object or same-file const object literal",
    };
  }

  const evaluated = evalRecipeConfigNode(node);
  if (!evaluated.ok) {
    return { start, end, kind: "dynamic", error: evaluated.error };
  }
  return { start, end, kind: "recipe", recipeConfig: evaluated.config };
};

const analyzeStyleCall = (
  call: CallExpression,
  constObjects: Map<string, ObjectExpression>,
  externalOptions?: Map<string, ResponsiveStyleOptions>
): AnalyzeHit => {
  const start = call.start ?? 0;
  const end = call.end ?? start;
  const arg = call.arguments[0];

  if (!arg) {
    return {
      start,
      end,
      kind: "dynamic",
      error: "style() requires a static object literal argument",
    };
  }
  if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder") {
    return {
      start,
      end,
      kind: "dynamic",
      error: "Spread arguments are not allowed in static style()",
    };
  }

  const evaluated = evalOptionsFromArg(arg, constObjects, externalOptions);
  if (!evaluated.ok) {
    return { start, end, kind: "dynamic", error: evaluated.error };
  }
  return { start, end, kind: "static", options: evaluated.options };
};

const analyzeExtendCall = (
  call: CallExpression,
  constObjects: Map<string, ObjectExpression>,
  styleBindings: Map<string, ResponsiveStyleOptions>,
  externalOptions?: Map<string, ResponsiveStyleOptions>
): AnalyzeHit => {
  const start = call.start ?? 0;
  const end = call.end ?? start;
  const callee = call.callee;

  if (!isExtendCallee(callee)) {
    return {
      start,
      end,
      kind: "dynamic",
      error: "Not an .extend() call",
    };
  }

  if (callee.object.type !== "Identifier") {
    return {
      start,
      end,
      kind: "dynamic",
      error:
        ".extend() base must be a same-file const style handle (not a computed expression). Loops and dynamic bases cannot be extracted to static CSS because the build cannot know every patch at compile time.",
    };
  }

  const baseName = callee.object.name;
  const baseOptions = styleBindings.get(baseName);
  if (!baseOptions) {
    return {
      start,
      end,
      kind: "dynamic",
      error: `.extend() base "${baseName}" is unknown in this file. Import handles from other files cannot be statically extended — extend in the same file as style(), or accept runtime emit without the plugin.`,
    };
  }

  const arg = call.arguments[0];
  if (!arg) {
    return {
      start,
      end,
      kind: "dynamic",
      error: ".extend() requires a static object literal argument",
    };
  }
  if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder") {
    return {
      start,
      end,
      kind: "dynamic",
      error: "Spread arguments are not allowed in static .extend()",
    };
  }

  const patchEval = evalOptionsFromArg(arg, constObjects, externalOptions);
  if (!patchEval.ok) {
    return {
      start,
      end,
      kind: "dynamic",
      error: patchEval.error,
    };
  }

  const options = mergeResponsiveOptions(baseOptions, patchEval.options);
  return { start, end, kind: "static", options };
};

const collectConstStringMaps = (
  constObjects: Map<string, ObjectExpression>
): Map<string, Record<string, string>> => {
  const out = new Map<string, Record<string, string>>();
  for (const [name, node] of constObjects) {
    const map: Record<string, string> = {};
    let ok = true;
    for (const prop of node.properties) {
      if (prop.type === "SpreadElement" || prop.type !== "ObjectProperty" || prop.computed) {
        ok = false;
        break;
      }
      const keyNode = prop.key;
      let key: string;
      if (keyNode.type === "Identifier") key = keyNode.name;
      else if (keyNode.type === "StringLiteral") key = keyNode.value;
      else if (keyNode.type === "NumericLiteral") key = String(keyNode.value);
      else {
        ok = false;
        break;
      }
      const lit = evalLiteral(prop.value as Expression);
      if (typeof lit !== "string" && typeof lit !== "number") {
        ok = false;
        break;
      }
      map[key] = String(lit);
    }
    if (ok && Object.keys(map).length > 0) out.set(name, map);
  }
  return out;
};

/**
 * Finds style(), variants(), and same-file .extend() calls; resolves .extend by
 * merging known style bindings in declaration order.
 */
export const analyzeStyleCalls = (
  code: string,
  extras: AnalyzeExtras = {}
): AnalyzeHit[] => {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  const constObjects = collectConstObjectBindings(ast);
  const styleBindings = new Map<string, ResponsiveStyleOptions>();
  const externalOptions = extras.externalOptions;
  const tokenMaps = new Map<string, Record<string, string>>([
    ...collectConstStringMaps(constObjects),
    ...(extras.tokenMaps ?? []),
  ]);
  const prevMaps = activeTokenMaps;
  activeTokenMaps = tokenMaps;

  const hits: AnalyzeHit[] = [];
  const seen = new Set<string>();

  const addHit = (hit: AnalyzeHit) => {
    const key = `${hit.start}:${hit.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  };

  try {
  // Declaration order: register bindings so later .extend can see earlier style/.extend.
  walk(ast, (node) => {
    if (node.type !== "VariableDeclaration") return;
    const decl = node as VariableDeclaration;
    if (decl.kind !== "const") return;

    for (const d of decl.declarations as VariableDeclarator[]) {
      if (d.id.type !== "Identifier" || !d.init) continue;
      if (d.init.type !== "CallExpression") continue;

      const call = d.init;
      const name = d.id.name;

      if (isStyleCallee(call.callee)) {
        const hit = analyzeStyleCall(call, constObjects, externalOptions);
        addHit(hit);
        if (hit.kind === "static" && hit.options) {
          styleBindings.set(name, hit.options);
        }
        continue;
      }

      if (isVariantsCallee(call.callee)) {
        addHit(analyzeVariantsCall(call, constObjects, externalOptions));
        continue;
      }

      if (isRecipeCallee(call.callee)) {
        addHit(analyzeRecipeCall(call, constObjects));
        continue;
      }

      if (isExtendCallee(call.callee)) {
        const hit = analyzeExtendCall(
          call,
          constObjects,
          styleBindings,
          externalOptions
        );
        addHit(hit);
        if (hit.kind === "static" && hit.options) {
          styleBindings.set(name, hit.options);
        }
      }
    }
  });

  // Any remaining style() / variants() / .extend() calls (e.g. inline expressions).
  walk(ast, (node) => {
    if (node.type !== "CallExpression") return;
    const call = node as CallExpression;
    const key = `${call.start ?? 0}:${call.end ?? 0}`;
    if (seen.has(key)) return;

    if (isStyleCallee(call.callee)) {
      addHit(analyzeStyleCall(call, constObjects, externalOptions));
      return;
    }

    if (isVariantsCallee(call.callee)) {
      addHit(analyzeVariantsCall(call, constObjects, externalOptions));
      return;
    }

    if (isRecipeCallee(call.callee)) {
      addHit(analyzeRecipeCall(call, constObjects));
      return;
    }

    if (isExtendCallee(call.callee)) {
      addHit(
        analyzeExtendCall(call, constObjects, styleBindings, externalOptions)
      );
    }
  });

  return hits;
  } finally {
    activeTokenMaps = prevMaps;
  }
};
