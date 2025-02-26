import { Context } from 'cordis'
import { PresetTemplate } from '@chatluna/core/preset'
import { BaseChatMessageHistory, BaseMessage, UserMessage } from 'cortexluna'

export interface ChatLunaLLMCallArg {
    message: UserMessage
    events?: ChainEvents
    stream?: boolean
    signal?: AbortSignal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: Record<string, any>
    variables?: Record<string, string | unknown>
}

export interface ChatLunaLLMChainWrapperInput {
    ctx?: Context
    preset: () => Promise<PresetTemplate>
    historyMemory: BaseChatMessageHistory
    verbose?: boolean
}

export interface ChainEvents {
    'llm-new-token'?: (token: string) => Promise<void>
    /** Only used for chat app */
    'chat-queue-waiting'?: (size: number) => Promise<void>
    'llm-used-token'?: (usedToken: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
    }) => Promise<void>
    'llm-call-tool'?: (tool: string, args: string) => Promise<void>
}

export type SystemPrompts = BaseMessage[]
