import { ChatLunaLLMChainWrapper } from '@chatluna/core/chain'
import { Context } from 'cordis'
/* import { ChatLunaSaveableVectorStore } from '@chatluna/core/vectorstore' */
import {
    BaseChatMessageHistory,
    BaseMessage,
    BaseTool,
    EmbeddingModel,
    LanguageModel,
    SaveableVectorStore
} from 'cortexluna'

export interface ChatLunaChainInfo {
    name: string
    description?: string
    createFunction: (
        params: CreateChatLunaLLMChainParams
    ) => Promise<ChatLunaLLMChainWrapper>
}

export interface CreateToolParams {
    model: LanguageModel
    embeddings: EmbeddingModel
    assistantId?: string
}

export interface CreateVectorStoreParams {
    key?: string
    embeddings: EmbeddingModel
    //  topK?: number
}

export interface CreateChatLunaLLMChainParams {
    model: LanguageModel
    embeddings?: EmbeddingModel
    historyMemory: BaseChatMessageHistory
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ChatLunaTool<T = any> {
    createTool: (params: CreateToolParams, arg?: T) => Promise<BaseTool>
    selector: (history: BaseMessage[]) => boolean

    authorization?: (arg: T) => boolean
    alwaysRecreate?: boolean
    enabled?: boolean
}

export type CreateVectorStoreFunction = (
    params: CreateVectorStoreParams
) => Promise<SaveableVectorStore>

export interface ContextWrapper<T> {
    ctx: Context
    value: T
}

export interface CreateVectorStoreParams {
    key?: string
    embeddings: EmbeddingModel
    //  topK?: number
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
