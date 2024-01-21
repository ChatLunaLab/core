import { ChatHubBaseEmbeddings } from '@chatluna/core/src/model'

export interface PlatformClientName {
    default: never
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
