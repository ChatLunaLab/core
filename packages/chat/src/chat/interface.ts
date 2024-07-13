import { BaseMessage } from '@langchain/core/messages'
import { Context } from 'cordis'
import { DataBaseChatMessageHistory } from '@chatluna/memory/memory'
import {
    ChatLunaLLMCallArg,
    ChatLunaLLMChainWrapper
} from '@chatluna/core/chain'
import { parseRawModelName } from '@chatluna/core/utils'
import {
    BufferWindowMemory,
    VectorStoreRetrieverMemory
} from '@chatluna/core/memory'
import {} from '@chatluna/memory/service'
import { ChatHubBaseEmbeddings, ChatLunaChatModel } from '@chatluna/core/model'
import { BaseChatMessageHistory } from '@langchain/core/chat_history'
import {
    ClientConfig,
    ModelCapability,
    ModelInfo,
    PlatformEmbeddingsClient,
    PlatformModelAndEmbeddingsClient,
    PlatformModelClient
} from '@chatluna/core/platform'
import { PlatformService } from '@chatluna/core/service'
import { VectorStore, VectorStoreRetriever } from '@langchain/core/vectorstores'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import { Embeddings } from '@langchain/core/embeddings'
import { ChainValues } from '@langchain/core/utils/types'
import {
    emptyEmbeddings,
    inMemoryVectorStoreRetrieverProvider
} from '@chatluna/core/vectorstore'
import { ScoreThresholdRetriever } from '@chatluna/core/retriever'
import { ChatLunaConversation } from '@chatluna/memory/types'

export class ChatInterface {
    private _input: ChatInterfaceInput
    private _vectorStoreRetrieverMemory: VectorStoreRetrieverMemory
    private _chatHistory: DataBaseChatMessageHistory
    private _chains: Record<string, ChatLunaLLMChainWrapper> = {}
    private _errorCount: Record<string, number> = {}

    constructor(
        public ctx: Context,
        input: ChatInterfaceInput
    ) {
        this._input = input
    }

    async chat(arg: ChatLunaLLMCallArg): Promise<ChainValues> {
        const [wrapper, config] = await this.createChatHubLLMChainWrapper()
        const configKey = this._getClientConfigAsKey(config)

        try {
            return wrapper.call(arg)
        } catch (e) {
            this._errorCount[configKey] = this._errorCount[configKey] ?? 0

            this._errorCount[configKey] += 1

            if (this._errorCount[configKey] > config.maxRetries) {
                delete this._chains[configKey]
                delete this._errorCount[configKey]

                const service = this.ctx.chatluna_platform

                service.makeConfigStatus(config, false)
            }

            if (e instanceof ChatLunaError) {
                throw e
            } else {
                throw new ChatLunaError(
                    ChatLunaErrorCode.UNKNOWN_ERROR,
                    e as Error
                )
            }
        }
    }

    async createChatHubLLMChainWrapper(): Promise<
        [ChatLunaLLMChainWrapper, ClientConfig]
    > {
        const service = this.ctx.chatluna_platform
        const [llmPlatform, llmModelName] = parseRawModelName(this._input.model)
        const currentLLMConfig = await service.randomConfig(llmPlatform)

        const currentLLMConfigKey = this._getClientConfigAsKey(currentLLMConfig)

        if (this._chains[currentLLMConfigKey]) {
            return [this._chains[currentLLMConfigKey], currentLLMConfig]
        }

        let embeddings: Embeddings
        let vectorStoreRetrieverMemory: VectorStoreRetrieverMemory
        let llm: ChatLunaChatModel
        let modelInfo: ModelInfo
        let historyMemory: BufferWindowMemory

        try {
            embeddings = await this._initEmbeddings(service)
        } catch (error) {
            if (error instanceof ChatLunaError) {
                throw error
            }
            throw new ChatLunaError(
                ChatLunaErrorCode.EMBEDDINGS_INIT_ERROR,
                error as Error
            )
        }

        try {
            vectorStoreRetrieverMemory = await this._initVectorStoreMemory(
                service,
                embeddings
            )
        } catch (error) {
            if (error instanceof ChatLunaError) {
                throw error
            }
            throw new ChatLunaError(
                ChatLunaErrorCode.VECTOR_STORE_INIT_ERROR,
                error as Error
            )
        }

        try {
            ;[llm, modelInfo] = await this._initModel(
                service,
                currentLLMConfig,
                llmModelName
            )
        } catch (error) {
            if (error instanceof ChatLunaError) {
                throw error
            }
            throw new ChatLunaError(
                ChatLunaErrorCode.MODEL_INIT_ERROR,
                error as Error
            )
        }

        embeddings = (await this._checkChatMode(modelInfo)) ?? embeddings

        try {
            await this._createChatHistory()
        } catch (error) {
            if (error instanceof ChatLunaError) {
                throw error
            }
            throw new ChatLunaError(
                ChatLunaErrorCode.CHAT_HISTORY_INIT_ERROR,
                error as Error
            )
        }

        try {
            historyMemory = await this._createHistoryMemory(llm)
        } catch (error) {
            if (error instanceof ChatLunaError) {
                throw error
            }
            throw new ChatLunaError(
                ChatLunaErrorCode.UNKNOWN_ERROR,
                error as Error
            )
        }

        const chatChain = await service.createChatChain(this._input.chatMode, {
            botName: this._input.botName,
            model: llm,
            embeddings,
            longMemory: vectorStoreRetrieverMemory,
            historyMemory,
            systemPrompt: this._input.systemPrompts,
            vectorStoreName: this._input.vectorStoreName
        })

        this._chains[currentLLMConfigKey] = chatChain

        return [chatChain, currentLLMConfig]
    }

    get chatHistory(): BaseChatMessageHistory {
        return this._chatHistory
    }

    async delete(
        ctx: Context,
        conversationId: string | ChatLunaConversation = this._input
            .conversationId
    ): Promise<void> {
        await this._chatHistory.getMessages()
        await this._chatHistory.clear()

        for (const chain of Object.values(this._chains)) {
            await chain.model.clearContext()
        }

        this._chains = {}

        await ctx.chatluna_conversation.deleteConversation(conversationId)
    }

    async clearChatHistory(): Promise<void> {
        if (this._chatHistory == null) {
            await this._createChatHistory()
        }

        await this._chatHistory.clear()

        for (const chain of Object.values(this._chains)) {
            await chain.model.clearContext()
        }
    }

    private async _initEmbeddings(
        service: PlatformService
    ): Promise<ChatHubBaseEmbeddings> {
        if (
            this._input.longMemory !== true &&
            this._input.chatMode === 'chat'
        ) {
            return emptyEmbeddings
        }

        if (this._input.embeddings == null) {
            this.ctx.logger.warn(
                'Embeddings are empty, falling back to fake embeddings. Try check your config.'
            )
            return emptyEmbeddings
        }

        const [platform, modelName] = parseRawModelName(this._input.embeddings)

        this.ctx.logger.info(`init embeddings for %c`, this._input.embeddings)

        const client = await service.randomClient(platform)

        if (client == null || client instanceof PlatformModelClient) {
            this.ctx.logger.warn(
                `Platform ${platform} is not supported, falling back to fake embeddings`
            )
            return emptyEmbeddings
        }

        if (client instanceof PlatformEmbeddingsClient) {
            return client.createModel(modelName)
        } else if (client instanceof PlatformModelAndEmbeddingsClient) {
            const model = client.createModel(modelName)

            if (model instanceof ChatLunaChatModel) {
                this.ctx.logger.warn(
                    `Model ${modelName} is not an embeddings model, falling back to fake embeddings`
                )
                return emptyEmbeddings
            }

            return model
        }
    }

    private async _initVectorStoreMemory(
        service: PlatformService,
        embeddings: Embeddings
    ): Promise<VectorStoreRetrieverMemory> {
        if (this._vectorStoreRetrieverMemory != null) {
            return this._vectorStoreRetrieverMemory
        }

        let vectorStoreRetriever: VectorStoreRetriever<VectorStore>

        if (
            this._input.longMemory !== true ||
            (this._input.chatMode !== 'chat' &&
                this._input.chatMode !== 'browsing')
        ) {
            vectorStoreRetriever =
                await inMemoryVectorStoreRetrieverProvider.createVectorStoreRetriever(
                    {
                        embeddings
                    }
                )
        } else if (this._input.vectorStoreName == null) {
            this.ctx.logger.warn(
                'Vector store is empty, falling back to fake vector store. Try check your config.'
            )

            vectorStoreRetriever =
                await inMemoryVectorStoreRetrieverProvider.createVectorStoreRetriever(
                    {
                        embeddings
                    }
                )
        } else {
            const store = await service.createVectorStore(
                this._input.vectorStoreName,
                {
                    embeddings,
                    key: this._input.conversationId
                }
            )

            vectorStoreRetriever = ScoreThresholdRetriever.fromVectorStore(
                store,
                {
                    minSimilarityScore: 0.85, // Finds results with at least this similarity score
                    maxK: 100, // The maximum K value to use. Use it based to your chunk size to make sure you don't run out of tokens
                    kIncrement: 2 // How much to increase K by each time. It'll fetch N results, then N + kIncrement, then N + kIncrement * 2, etc.
                }
            )
        }

        this._vectorStoreRetrieverMemory = new VectorStoreRetrieverMemory({
            returnDocs: true,
            inputKey: 'user',
            outputKey: 'your',
            vectorStoreRetriever
        })

        return this._vectorStoreRetrieverMemory
    }

    private async _initModel(
        service: PlatformService,
        config: ClientConfig,
        llmModelName: string
    ): Promise<[ChatLunaChatModel, ModelInfo]> {
        const platform = await service.getClient(config)

        const llmInfo = (await platform.getModels()).find(
            (model) => model.name === llmModelName
        )

        const llmModel = platform.createModel(llmModelName)

        if (llmModel instanceof ChatLunaChatModel) {
            return [llmModel, llmInfo]
        }
    }

    private async _checkChatMode(modelInfo: ModelInfo) {
        if (
            // func call with plugin browsing
            !modelInfo.capabilities.includes(ModelCapability.INPUT_FUNC_CALL) &&
            ['plugin', 'browsing'].includes(this._input.chatMode)
        ) {
            this.ctx.logger.warn(
                `Chat mode ${this._input.chatMode} is not supported by model ${this._input.model}, falling back to chat mode`
            )

            this._input.chatMode = 'chat'
            const embeddings = emptyEmbeddings

            const vectorStoreRetriever =
                await inMemoryVectorStoreRetrieverProvider.createVectorStoreRetriever(
                    {
                        embeddings
                    }
                )

            this._vectorStoreRetrieverMemory = new VectorStoreRetrieverMemory({
                returnDocs: true,
                inputKey: 'user',
                outputKey: 'your',
                vectorStoreRetriever
            })

            return embeddings
        }

        return undefined
    }

    private async _createChatHistory(): Promise<BaseChatMessageHistory> {
        if (this._chatHistory != null) {
            return this._chatHistory
        }

        this._chatHistory = new DataBaseChatMessageHistory(
            this.ctx,
            this._input.conversationId,
            this._input.maxMessagesCount
        )

        await this._chatHistory.loadConversation()

        return this._chatHistory
    }

    private async _createHistoryMemory(
        model: ChatLunaChatModel
    ): Promise<BufferWindowMemory> {
        const historyMemory = new BufferWindowMemory({
            returnMessages: true,
            inputKey: 'input',
            outputKey: 'output',
            chatHistory: this._chatHistory,
            humanPrefix: 'user',
            aiPrefix: this._input.botName
        })

        return historyMemory
    }

    private _getClientConfigAsKey(config: ClientConfig) {
        return `${config.platform}/${config.apiKey}/${config.apiEndpoint}/${config.maxRetries}/${config.concurrentMaxSize}/${config.timeout}`
    }
}

export interface ChatInterfaceInput {
    chatMode: string
    historyMode: 'all'
    botName?: string
    systemPrompts?: BaseMessage[]
    model: string
    embeddings?: string
    vectorStoreName?: string
    longMemory: boolean
    conversationId: string
    maxMessagesCount: number
}
