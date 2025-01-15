import { ChatLunaBaseEmbeddings, ChatLunaChatModel } from '@chatluna/core/model'
import { StructuredTool } from '@langchain/core/tools'
import { BaseMessage } from '@langchain/core/messages'
import { ChatLunaLLMChainWrapper } from '@chatluna/core/chain'
import { BasePlatformClient } from '@chatluna/core/platform'
import { BufferWindowMemory } from '@chatluna/core/memory'
import { Context } from 'cordis'
import { ChatLunaSaveableVectorStore } from '@chatluna/core/vectorstore'

export interface ChatLunaChainInfo {
    name: string
    description?: string
    createFunction: (
        params: CreateChatLunaLLMChainParams
    ) => Promise<ChatLunaLLMChainWrapper>
}

export interface CreateToolParams {
    model: ChatLunaChatModel
    embeddings: ChatLunaBaseEmbeddings
    assistantId?: string
}

export interface CreateVectorStoreParams {
    key?: string
    embeddings: ChatLunaBaseEmbeddings
    //  topK?: number
}

export interface CreateChatLunaLLMChainParams {
    model: ChatLunaChatModel
    embeddings?: ChatLunaBaseEmbeddings
    historyMemory: BufferWindowMemory
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ChatLunaTool<T = any> {
    createTool: (params: CreateToolParams, arg?: T) => Promise<StructuredTool>
    selector: (history: BaseMessage[]) => boolean

    authorization?: (arg: T) => boolean
    alwaysRecreate?: boolean
    enabled?: boolean
}

export type CreateVectorStoreFunction = (
    params: CreateVectorStoreParams
) => Promise<ChatLunaSaveableVectorStore>

export type CreateClientFunction = (ctx: Context) => BasePlatformClient

export interface ContextWrapper<T> {
    ctx: Context
    value: T
}

export interface ModelInfo {
    name: string

    type: ModelType

    maxTokens?: number

    capabilities?: ModelCapability[]

    costPerTokenInput?: number

    costPerTokenOutput?: number
}

export interface PlatformModelInfo extends ModelInfo {
    platform: string
}

export enum ModelCapability {
    INPUT_TEXT,
    INPUT_VOICE,
    INPUT_IMAGE,
    OUTPUT_TEXT,
    OUTPUT_IMAGE,
    OUTPUT_VOICE,
    FUNCTION_CALL
}

export interface CreateVectorStoreParams {
    key?: string
    embeddings: ChatLunaBaseEmbeddings
    //  topK?: number
}

export enum ModelType {
    all,
    llm,
    embeddings
}

/* declare module '@langchain/core/messages' {
    interface BaseMessageFields {
        content: MessageContent
        name?: string
        additional_kwargs?: {
            [key: string]: unknown
            function_call?: FunctionCall
            tool_calls?: ToolCall[]
        } & {
            input_images?: string[]
            input_voice?: string[]
            output_images?: string[]
            output_voice?: string[]
            additionalMessage?: string
        }
    }
}
 */
