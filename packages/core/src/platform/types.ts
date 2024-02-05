import { ChatHubBaseEmbeddings, ChatLunaChatModel } from '@chatluna/core/model'
import { VectorStore } from '@langchain/core/vectorstores'
import { StructuredTool } from '@langchain/core/tools'
import { BaseMessage } from '@langchain/core/messages'
import { ChatLunaLLMChainWrapper, SystemPrompts } from '@chatluna/core/chain'
import { BasePlatformClient, ClientConfig } from '@chatluna/core/platform'
import {
    BufferWindowMemory,
    VectorStoreRetrieverMemory
} from '@chatluna/core/memory'
import { Context } from '@cordisjs/core'

export interface ChatLunaChainInfo {
    name: string
    description?: string
    createFunction: (
        params: CreateChatLunaLLMChainParams
    ) => Promise<ChatLunaLLMChainWrapper>
}

export interface CreateToolParams {
    model: ChatLunaChatModel
    embeddings: ChatHubBaseEmbeddings
}

export interface CreateVectorStoreParams {
    key?: string
    embeddings: ChatHubBaseEmbeddings
    //  topK?: number
}

export interface CreateChatLunaLLMChainParams {
    botName: string
    model: ChatLunaChatModel
    embeddings?: ChatHubBaseEmbeddings
    longMemory?: VectorStoreRetrieverMemory
    historyMemory: BufferWindowMemory
    systemPrompt?: SystemPrompts
    vectorStoreName?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ChatLunaTool<T = any> {
    createTool: (params: CreateToolParams, arg?: T) => Promise<StructuredTool>
    selector: (history: BaseMessage[]) => boolean

    authorization?: (arg: T) => boolean
    alwaysRecreate?: boolean
}

export type CreateVectorStoreFunction = (
    params: CreateVectorStoreParams
) => Promise<VectorStore>

export type CreateClientFunction = (
    ctx: Context,
    config: ClientConfig
) => BasePlatformClient

export interface ContextWrapper<T> {
    ctx: Context
    value: T
}

export interface ModelInfo {
    name: string

    type: ModelType

    maxTokens?: number

    functionCall?: boolean
}

export interface CreateVectorStoreParams {
    key?: string
    embeddings: ChatHubBaseEmbeddings
    //  topK?: number
}

export enum ModelType {
    all,
    llm,
    embeddings
}
