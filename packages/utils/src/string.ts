import { createHash } from 'crypto'

export function sha1(text: string) {
    return createHash('sha1').update(text).digest('hex')
}

// https://github.com/koishijs/koishi/blob/4dd30f2bb1e56a05e0b4aba4a0b91a463bcdf053/packages/utils/src/string.ts#L10

// eslint-disable-next-line no-new-func
const evaluate = new Function(
    'context',
    'expr',
    `
    try {
      with (context) {
        return eval(expr)
      }
    } catch {}
  `
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as (context: object, expr: string) => any

export function interpolate(
    template: string,
    context: object = {
        env: process.env
    },
    pattern = /\$\{\{(.+?)\}\}/g
) {
    let capture: RegExpExecArray
    let result = '',
        lastIndex = 0

    while ((capture = pattern.exec(template))) {
        if (capture[0] === template) {
            return evaluate(context, capture[1])
        }
        result += template.slice(lastIndex, capture.index)
        result += evaluate(context, capture[1]) ?? ''
        lastIndex = capture.index + capture[0].length
    }
    return result + template.slice(lastIndex)
}
