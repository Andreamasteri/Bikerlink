/**
 * ESLint rule: no-part-nav
 *
 * Catches navigation calls where a template-literal argument contains a
 * ".partN" segment (e.g. `push(\`/giri/${id}.part2\`)`).
 *
 * Static string literals are already covered by the grep gate in
 * scripts/post-merge.sh.  This rule closes the gap for dynamically-
 * constructed paths that grep cannot see.
 *
 * Covered call shapes:
 *   router.push(...)  router.replace(...)  router.navigate(...)
 *   push(...)  replace(...)  navigate(...)   (destructured useRouter)
 *   <Link href={`...`}>
 *
 * A template literal matches when at least one of its string parts
 * (quasis / cooked text) contains ".part" followed by a digit.
 */

"use strict";

const NAV_METHODS = new Set(["push", "replace", "navigate"]);
const PART_RE = /\.part\d/;

function templateLiteralHasPart(node) {
  return node.quasis.some(
    (q) => q.value.cooked != null && PART_RE.test(q.value.cooked)
  );
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Warn when a navigation call uses a template literal containing ".partN". ' +
        "Files named *.partN.tsx are helper modules excluded from Expo Router; " +
        "navigating to them causes a silent 404.",
    },
    schema: [],
    messages: {
      noPartNav:
        'Navigation path contains ".partN" — helper modules are not Expo Router routes. ' +
        "This path will 404 at runtime.",
    },
  },

  create(context) {
    function checkArg(argNode) {
      if (argNode && argNode.type === "TemplateLiteral" && templateLiteralHasPart(argNode)) {
        context.report({ node: argNode, messageId: "noPartNav" });
      }
    }

    return {
      // router.push(`...`), router.replace(`...`), router.navigate(`...`)
      // push(`...`), replace(`...`), navigate(`...`)
      CallExpression(node) {
        const callee = node.callee;
        let methodName = null;

        if (callee.type === "MemberExpression") {
          if (callee.property.type === "Identifier") {
            methodName = callee.property.name;
          }
        } else if (callee.type === "Identifier") {
          methodName = callee.name;
        }

        if (methodName && NAV_METHODS.has(methodName)) {
          checkArg(node.arguments[0]);
        }
      },

      // <Link href={`...`}> and href={`...`} JSX attributes
      JSXAttribute(node) {
        if (
          node.name &&
          node.name.type === "JSXIdentifier" &&
          node.name.name === "href" &&
          node.value &&
          node.value.type === "JSXExpressionContainer"
        ) {
          checkArg(node.value.expression);
        }
      },
    };
  },
};
