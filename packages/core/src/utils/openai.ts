import { MessageType } from '@langchain/core/messages'

export function messageTypeToOpenAIRole(type: MessageType): string {
    switch (type) {
        case 'system':
            return 'system'
        case 'ai':
            return 'assistant'
        case 'human':
            return 'user'
        case 'function':
            return 'function'
        case 'tool':
            return 'tool'
        default:
            throw new Error(`Unknown message type: ${type}`)
    }
}
