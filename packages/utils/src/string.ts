import { createHash } from 'crypto'

export function sha1(text: string) {
    return createHash('sha1').update(text).digest('hex')
}
