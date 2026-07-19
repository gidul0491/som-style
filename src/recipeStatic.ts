import type { Expression, ObjectExpression } from "@babel/types";
import type { StyleExtendPatch } from "./extendStyle.js";
import type { RecipeConfig } from "./recipeExpand.js";
import type { ResponsiveStyleOptions, StyleObject } from "./types.js";

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

const evalStyleObject = (
  node: ObjectExpression
): { ok: true; value: StyleObject } | { ok: false; error: string } => {
  const out: Record<string, string | number | StyleObject> = {};
  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      return { ok: false, error: "SpreadElement is not allowed" };
    }
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return { ok: false, error: "Only static object properties are allowed" };
    }
    const keyNode = prop.key;
    let key: string;
    if (keyNode.type === "Identifier") key = keyNode.name;
    else if (keyNode.type === "StringLiteral") key = keyNode.value;
    else return { ok: false, error: "Unsupported property key" };

    const valueNode = prop.value;
    if (valueNode.type === "ObjectExpression") {
      const nested = evalStyleObject(valueNode);
      if (!nested.ok) return nested;
      out[key] = nested.value;
      continue;
    }
    if (
      valueNode.type !== "StringLiteral" &&
      valueNode.type !== "NumericLiteral" &&
      valueNode.type !== "BooleanLiteral" &&
      valueNode.type !== "NullLiteral" &&
      !(
        valueNode.type === "TemplateLiteral" &&
        valueNode.expressions.length === 0
      )
    ) {
      return { ok: false, error: `Dynamic value for "${key}"` };
    }
    const lit = evalLiteral(valueNode as Expression);
    if (lit === undefined) return { ok: false, error: "Unsupported literal" };
    if (lit === null) continue;
    out[key] = lit as string | number | StyleObject;
  }
  return { ok: true, value: out as StyleObject };
};

const evalResponsive = (
  node: ObjectExpression
): { ok: true; value: ResponsiveStyleOptions } | { ok: false; error: string } => {
  const evaluated = evalStyleObject(node);
  if (!evaluated.ok) return evaluated;
  const options = evaluated.value as ResponsiveStyleOptions;
  if (!options.base || typeof options.base !== "object") {
    return { ok: false, error: 'options must include a "base" object' };
  }
  return { ok: true, value: options };
};

const evalPatch = (
  node: ObjectExpression
): { ok: true; value: StyleExtendPatch } | { ok: false; error: string } => {
  const evaluated = evalStyleObject(node);
  if (!evaluated.ok) return evaluated;
  return { ok: true, value: evaluated.value as StyleExtendPatch };
};

/** Evaluate a static recipe({ ... }) object literal. */
export const evalRecipeConfigNode = (
  node: ObjectExpression
): { ok: true; config: RecipeConfig } | { ok: false; error: string } => {
  let base: ResponsiveStyleOptions | undefined;
  let variants: RecipeConfig["variants"];
  let compoundVariants: RecipeConfig["compoundVariants"];
  let defaultVariants: Record<string, string> | undefined;

  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      return { ok: false, error: "SpreadElement is not allowed in recipe()" };
    }
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return { ok: false, error: "recipe() config keys must be static" };
    }
    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "StringLiteral"
          ? prop.key.value
          : null;
    if (!key) return { ok: false, error: "Unsupported recipe() key" };

    if (key === "base") {
      if (prop.value.type !== "ObjectExpression") {
        return { ok: false, error: 'recipe().base must be an object' };
      }
      const r = evalResponsive(prop.value);
      if (!r.ok) return r;
      base = r.value;
      continue;
    }

    if (key === "defaultVariants") {
      if (prop.value.type !== "ObjectExpression") {
        return { ok: false, error: "defaultVariants must be an object" };
      }
      defaultVariants = {};
      for (const p of prop.value.properties) {
        if (p.type !== "ObjectProperty" || p.computed) {
          return { ok: false, error: "defaultVariants keys must be static" };
        }
        const dk =
          p.key.type === "Identifier"
            ? p.key.name
            : p.key.type === "StringLiteral"
              ? p.key.value
              : null;
        if (!dk) return { ok: false, error: "bad defaultVariants key" };
        const lit = evalLiteral(p.value as Expression);
        if (typeof lit !== "string") {
          return { ok: false, error: "defaultVariants values must be strings" };
        }
        defaultVariants[dk] = lit;
      }
      continue;
    }

    if (key === "variants") {
      if (prop.value.type !== "ObjectExpression") {
        return { ok: false, error: "variants must be an object" };
      }
      variants = {};
      for (const axisProp of prop.value.properties) {
        if (axisProp.type !== "ObjectProperty" || axisProp.computed) {
          return { ok: false, error: "variant axes must be static" };
        }
        const axis =
          axisProp.key.type === "Identifier"
            ? axisProp.key.name
            : axisProp.key.type === "StringLiteral"
              ? axisProp.key.value
              : null;
        if (!axis || axisProp.value.type !== "ObjectExpression") {
          return { ok: false, error: `variants.${axis} must be an object` };
        }
        const axisMap: Record<string, StyleExtendPatch> = {};
        for (const valProp of axisProp.value.properties) {
          if (valProp.type !== "ObjectProperty" || valProp.computed) {
            return { ok: false, error: "variant values must be static" };
          }
          const vk =
            valProp.key.type === "Identifier"
              ? valProp.key.name
              : valProp.key.type === "StringLiteral"
                ? valProp.key.value
                : null;
          if (!vk || valProp.value.type !== "ObjectExpression") {
            return { ok: false, error: `variants.${axis}.${vk} must be object` };
          }
          const patch = evalPatch(valProp.value);
          if (!patch.ok) return patch;
          axisMap[vk] = patch.value;
        }
        variants[axis] = axisMap;
      }
      continue;
    }

    if (key === "compoundVariants") {
      if (prop.value.type !== "ArrayExpression") {
        return { ok: false, error: "compoundVariants must be an array" };
      }
      compoundVariants = [];
      for (const el of prop.value.elements) {
        if (!el || el.type !== "ObjectExpression") {
          return { ok: false, error: "compoundVariants entries must be objects" };
        }
        const entry: {
          css: StyleExtendPatch;
          [axis: string]: string | StyleExtendPatch;
        } = { css: { base: {} } };
        for (const cp of el.properties) {
          if (cp.type !== "ObjectProperty" || cp.computed) {
            return { ok: false, error: "compound entry keys must be static" };
          }
          const ck =
            cp.key.type === "Identifier"
              ? cp.key.name
              : cp.key.type === "StringLiteral"
                ? cp.key.value
                : null;
          if (!ck) return { ok: false, error: "bad compound key" };
          if (ck === "css") {
            if (cp.value.type !== "ObjectExpression") {
              return { ok: false, error: "compound css must be object" };
            }
            const patch = evalPatch(cp.value);
            if (!patch.ok) return patch;
            entry.css = patch.value;
          } else {
            const lit = evalLiteral(cp.value as Expression);
            if (typeof lit !== "string") {
              return { ok: false, error: "compound conditions must be strings" };
            }
            entry[ck] = lit;
          }
        }
        compoundVariants.push(entry);
      }
      continue;
    }

    return { ok: false, error: `Unknown recipe() key "${key}"` };
  }

  if (!base) return { ok: false, error: "recipe() requires base" };
  return {
    ok: true,
    config: { base, variants, compoundVariants, defaultVariants },
  };
};
