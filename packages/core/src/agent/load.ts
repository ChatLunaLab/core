import { RawAgent } from './types.ts'
import { load } from 'js-yaml'

export function loadAgentFile(source: string): RawAgent {
    const rawAgent = load(source) as RawAgent
    return rawAgent
}
