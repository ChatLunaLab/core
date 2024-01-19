export interface PlatformClientName {
    default: never
}

export interface ModelInfo {
    name: string

    type: ModelType

    maxTokens?: number

    functionCall?: boolean
}

export enum ModelType {
    all,
    llm,
    embeddings
}
