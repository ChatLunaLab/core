import { BaseChatMemory } from '@chatluna/core/memory'
import { Context } from '@cordisjs/core'
import {
    BaseMessage,
    BaseMessageChunk,
    HumanMessage
} from '@langchain/core/messages'
import { Runnable, RunnableConfig } from '@langchain/core/runnables'
import { ChainValues } from '@langchain/core/utils/types'
import { PresetTemplate } from '@chatluna/core/preset'

export interface ChatLunaLLMCallArg {
    message: HumanMessage
    events?: ChainEvents
    stream?: boolean
    signal?: AbortSignal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: Record<string, any>
    variables?: ChainValues
}

export interface ChatLunaLLMChainWrapperInput {
    ctx?: Context
    preset: () => Promise<PresetTemplate>
    historyMemory: BaseChatMemory
    verbose?: boolean
}

export interface ChainEvents {
    'llm-new-token'?: (token: string) => Promise<void>
    /** Only used for chat app */
    'chat-queue-waiting'?: (size: number) => Promise<void>
    'llm-used-token-count'?: (token: number) => Promise<void>
    'llm-call-tool'?: (tool: string, args: string) => Promise<void>
}

export type SystemPrompts = BaseMessage[]
export type ChatLunaLLMChain = Runnable<
    ChainValues,
    BaseMessageChunk,
    RunnableConfig
>
