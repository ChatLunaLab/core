import { BaseMessage, HumanMessage } from '@langchain/core/messages'

export interface ChatLunaLLMCallArg {
    message: HumanMessage
    events: ChainEvents
    stream: boolean
}

export interface ChainEvents {
    'llm-new-token'?: (token: string) => Promise<void>
    /** Only used for chat app */
    'chat-queue-waiting'?: (size: number) => Promise<void>
    'llm-used-token-count'?: (token: number) => Promise<void>
    'llm-call-tool'?: (tool: string, args: string) => Promise<void>
}

export type SystemPrompts = BaseMessage[]
