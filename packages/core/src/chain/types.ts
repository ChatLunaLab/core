import {
    BaseMessage,
    BaseMessageChunk,
    HumanMessage
} from '@langchain/core/messages'
import { Context } from 'cordis'
import {
    BufferWindowMemory,
    VectorStoreRetrieverMemory
} from '@chatluna/core/src/memory'
import { Runnable, RunnableConfig } from '@langchain/core/runnables'
import { ChainValues } from '@langchain/core/utils/types'

export interface ChatLunaLLMCallArg {
    message: HumanMessage
    events?: ChainEvents
    stream?: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: Record<string, any>
}

export interface ChatLunaLLMChainWrapperInput {
    ctx?: Context
    systemPrompts?: SystemPrompts
    longMemory?: VectorStoreRetrieverMemory
    humanMessagePrompt?: string
    historyMemory: BufferWindowMemory
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
