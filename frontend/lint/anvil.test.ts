import { RuleTester } from 'oxlint/plugins-dev'
import { describe, it } from 'vitest'
import plugin from './anvil.ts'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } })
const useDocstring = { messageId: 'useDocstring' }

tester.run('comment-above-declaration', plugin.rules['comment-above-declaration'], {
  valid: [
    '/** A docstring. */\nfunction f() {}',
    '/**\n * A docstring.\n */\nexport function f() {}',
    '// Separated by a blank line.\n\nfunction f() {}',
    'g() // A trailing comment.\nfunction f() {}',
    'function f() {\n  // Explains the line below, not f.\n  return 1\n}',
    "// Not exported: may explain the value, not the name.\nconst x = 1",
    '/* A block comment. */\nfunction f() {}',
    '// oxlint-disable-next-line no-unused-vars\nfunction f() {}',
    '// eslint-disable-next-line no-unused-vars\nfunction f() {}',
    '// @ts-expect-error: wrong on purpose\nconst x: number = "a"',
    '// @ts-ignore\nexport const x: number = "a"',
    '// anvil: hand-edited primitive\nexport function Button() {}',
  ],
  invalid: [
    { code: '// Explains f.\nfunction f() {}', errors: [useDocstring] },
    { code: '// Explains f.\nexport function f() {}', errors: [useDocstring] },
    { code: '// Explains f.\nexport default function f() {}', errors: [useDocstring] },
    { code: '// Explains f.\nasync function f() {}', errors: [useDocstring] },
    { code: '// Explains C.\nclass C {}', errors: [useDocstring] },
    { code: '// Explains I.\ninterface I {}', errors: [useDocstring] },
    { code: '// Explains T.\nexport type T = string', errors: [useDocstring] },
    { code: '// Explains x.\nexport const x = () => 1', errors: [useDocstring] },
    {
      code: 'function g() {\n  // Explains f.\n  function f() {}\n}',
      errors: [{ ...useDocstring, line: 2 }],
    },
    {
      name: 'every line of a comment block',
      code: '// One.\n// Two.\nfunction f() {}',
      errors: [
        { ...useDocstring, line: 1 },
        { ...useDocstring, line: 2 },
      ],
    },
    {
      name: 'an explanation beside a directive',
      code: '// Explains f.\n// oxlint-disable-next-line no-unused-vars\nfunction f() {}',
      errors: [{ ...useDocstring, line: 1 }],
    },
  ],
})
