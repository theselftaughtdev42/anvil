/**
 * Anvil's own oxlint rules, loaded through `jsPlugins` in `.oxlintrc.json`.
 */
import type { RuleTester } from 'oxlint/plugins-dev'

type Rule = Parameters<RuleTester['run']>[1]
type Context = Parameters<Rule['create'] & {}>[0]
type Visitor = NonNullable<ReturnType<Rule['create'] & {}>[string]>
type Node = Parameters<Visitor>[0]
type Comment = ReturnType<Context['sourceCode']['getCommentsBefore']>[number]

/** Comments that steer a tool rather than explain the code below them. */
const DIRECTIVE = /^\s*(?:oxlint-|eslint-|@ts-(?:expect-error|ignore|nocheck)|anvil:)/

/**
 * Flags a `//` comment directly above a declaration, which AGENTS.md says
 * should be a `/** *\/` docstring instead.
 */
const commentAboveDeclaration: Rule = {
  meta: {
    type: 'suggestion',
    messages: {
      useDocstring:
        'Explain a declaration with a /** */ docstring, not a // comment above it (AGENTS.md, "Comments and docstrings").',
    },
  },
  create(context) {
    const { sourceCode } = context
    const lines = sourceCode.getLines()

    const isOwnLine = (comment: Comment) =>
      lines[comment.loc.start.line - 1].slice(0, comment.loc.start.column).trim() === ''

    function check(declaration: Node) {
      const { parent } = declaration
      // An export keyword comes before the declaration, so its comments sit above the export.
      const target =
        parent?.type === 'ExportNamedDeclaration' || parent?.type === 'ExportDefaultDeclaration'
          ? parent
          : declaration
      let nextLine = sourceCode.getLoc(target).start.line
      for (const comment of sourceCode.getCommentsBefore(target).reverse()) {
        if (comment.type !== 'Line' || comment.loc.end.line !== nextLine - 1 || !isOwnLine(comment)) break
        if (!DIRECTIVE.test(comment.value)) context.report({ node: comment, messageId: 'useDocstring' })
        nextLine = comment.loc.start.line
      }
    }

    return {
      FunctionDeclaration: check,
      ClassDeclaration: check,
      TSInterfaceDeclaration: check,
      TSTypeAliasDeclaration: check,
      VariableDeclaration(node) {
        if (node.type !== 'VariableDeclaration') return
        if (node.kind === 'const' && node.parent.type === 'ExportNamedDeclaration') check(node)
      },
    }
  },
}

export default {
  meta: { name: 'anvil' },
  rules: { 'comment-above-declaration': commentAboveDeclaration },
}
