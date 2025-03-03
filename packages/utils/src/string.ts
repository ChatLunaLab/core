import { createHash } from 'crypto'
import type { MessageContent } from 'cortexluna'

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

export function fuzzyQuery(source: string, keywords: string[]): boolean {
    for (const keyword of keywords) {
        const match = source.includes(keyword)
        if (match) {
            return true
        }
    }
    return false
}

export function getMessageContent(message: MessageContent) {
    if (typeof message === 'string') {
        return message
    }

    if (message == null) {
        return ''
    }

    const buffer: string[] = []
    for (const part of message) {
        if (part.type === 'text') {
            buffer.push(part.text as string)
        }
    }
    return buffer.join('')
}

export function getNotEmptyString(...texts: (string | undefined)[]): string {
    for (const text of texts) {
        if (text && text?.length > 0) {
            return text
        }
    }
}

export function getCurrentWeekday() {
    const daysOfWeek = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'
    ]
    const currentDate = new Date()
    return daysOfWeek[currentDate.getDay()]
}

export const getTimeInUTC = (offset: number): string => {
    const date = new Date()
    date.setMinutes(date.getMinutes() + offset * 60)
    return date.toISOString().substring(11, 8)
}

export const getTimeDiffFormat = (time1: number, time2: number): string => {
    const diff = Math.abs(time1 - time2)
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    const parts = []
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`)
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`)
    if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`)

    return parts.join(', ') || 'now'
}
export const getTimeDiff = (time1: string, time2: string): string => {
    return getTimeDiffFormat(
        new Date(time1).getTime(),
        new Date(time2).getTime()
    )
}

const pickMaps: Record<string, string> = {}
export const selectFromList = (args: string, isPick: boolean): string => {
    const items = args.split(',').map((item) => item.trim())
    if (isPick) {
        if (pickMaps[args]) {
            const lastPick = pickMaps[args]

            return lastPick
        }
        const pick = items[Math.floor(Math.random() * items.length)]

        pickMaps[args] = pick

        return pick
    }
    return items[Math.floor(Math.random() * items.length)]
}

export const rollDice = (formula: string): number => {
    const parts = formula.split('d')
    let count = 1
    if (parts.length > 1 && !isNaN(Number(parts[0]))) {
        count = parseInt(parts[0], 10)
    }

    const lastPart = parts[parts.length - 1].split('+')
    let add = 0
    if (lastPart.length > 1 && !isNaN(Number(lastPart[1]))) {
        add = parseInt(lastPart[1], 10)
    }

    const range = !isNaN(Number(lastPart[0])) ? parseInt(lastPart[0], 10) : 1

    return Math.floor(Math.random() * (count * range - count + 1)) + count + add
}
