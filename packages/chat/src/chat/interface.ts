import { Context } from 'cordis'
import { DataBaseChatMessageHistory } from '@chatluna/memory/memory'
import { parseRawModelName } from '@chatluna/core/utils'
import {
    BufferWindowMemory,
    VectorStoreRetrieverMemory
} from '@chatluna/core/memory'
import {} from '@chatluna/memory/service'
import { ChatLunaBaseEmbeddings, ChatLunaChatModel } from '@chatluna/core/model'
import { BaseChatMessageHistory } from '@langchain/core/chat_history'
import {
    ClientConfig,
    ModelInfo,
    PlatformEmbeddingsClient,
    PlatformModelAndEmbeddingsClient,
    PlatformModelClient
} from '@chatluna/core/platform'
import { PlatformService } from '@chatluna/core/service'
import { VectorStore, VectorStoreRetriever } from '@langchain/core/vectorstores'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import { Embeddings } from '@langchain/core/embeddings'
import {
    emptyEmbeddings,
    inMemoryVectorStoreRetrieverProvider
} from '@chatluna/core/vectorstore'
import { ScoreThresholdRetriever } from '@chatluna/core/retriever'
import { ChatLunaConversation } from '@chatluna/memory/types'
import {
    Agent,
    AgentSystem,
    DefaultEnvironment,
    Environment
} from '@chatluna/agent'
import { BaseMessage, HumanMessage } from '@langchain/core/messages'
import crypto from 'crypto'

export class ChatInterface {
    private _input: ChatInterfaceInput
    private _vectorStoreRetrieverMemory: VectorStoreRetrieverMemory
    private _chatHistory: DataBaseChatMessageHistory
    private _models: Record<string, [ChatLunaChatModel, ClientConfig]> = {}
    private _errorCountsMap: Record<string, number[]> = {}
    private _agentSystem: AgentSystem
    private _environment: Environment
    private _configs: Record<string, ClientConfig> = {}

    constructor(
        public ctx: Context,
        input: ChatInterfaceInput
    ) {
        this._input = input
    }

    async chat(arg: ChatInterfaceArg): Promise<BaseMessage> {
        await this.initAgentEnvironment()

        const requestId = crypto.randomUUID()
        try {
            return this._agentSystem.invoke(
                this._input.agent.name,
                arg.message,
                {
                    ...arg,
                    requestId
                }
            )
        } catch (e) {
            if (
                e instanceof ChatLunaError &&
                e.errorCode === ChatLunaErrorCode.API_UNSAFE_CONTENT
            ) {
                // unsafe content not to real error
                throw e
            }

            const config = this._configs[requestId]
            const configKey = this._getClientConfigAsKey(config)

            delete this._configs[requestId]

            this._errorCountsMap[configKey] =
                this._errorCountsMap[configKey] ?? []

            let errorCountsArray = this._errorCountsMap[configKey]

            errorCountsArray.push(Date.now())

            if (errorCountsArray.length > 100) {
                errorCountsArray = errorCountsArray.splice(
                    -config.maxRetries * 3
                )
            }

            this._errorCountsMap[configKey] = errorCountsArray

            if (
                errorCountsArray.length > config.maxRetries &&
                // 20 mins
                checkRange(
                    errorCountsArray.splice(-config.maxRetries),
                    1000 * 60 * 20
                )
            ) {
                delete this._models[configKey]
                delete this._errorCountsMap[configKey]

                const service = this.ctx.chatluna_platform

                service.makeConfigStatus(config, false)
            }

            if (e instanceof ChatLunaError) {
                throw e
            } else {
                throw new ChatLunaError(
                    ChatLunaErrorCode.UNKNOWN_ERROR,
                    e as string
                )
            }
        }
    }

    async initAgentEnvironment() {
        /*  const service = this.ctx.chatluna_platform
        const [llmPlatform, llmModelName] = parseRawModelName(this._input.model)
        const currentLLMConfig = await service.randomConfig(llmPlatform)

        const currentLLMConfigKey = this._getClientConfigAsKey(currentLLMConfig)

        if (this._chains[currentLLMConfigKey]) {
            return [this._chains[currentLLMConfigKey], currentLLMConfig]
        }
 */

        if (this._agentSystem != null) {
            return
        }

        const service = this.ctx.chatluna_platform

        /*   let embeddings: Embeddings
        let vectorStoreRetrieverMemory: VectorStoreRetrieverMemory

        let modelInfo: ModelInfo */
        let historyMemory: BufferWindowMemory

        /* try {
            embeddings = await this._initEmbeddings(service)
        } catch (error) {
            if (error instanceof ChatLunaError) {
                throw error
            }
            throw new ChatLunaError(
                ChatLunaErrorCode.EMBEDDINGS_INIT_ERROR,
                error as Error
            )
        } */

        /* try {
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
 */

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
            historyMemory = await this._createHistoryMemory()
        } catch (error) {
            if (error instanceof ChatLunaError) {
                throw error
            }
            throw new ChatLunaError(
                ChatLunaErrorCode.UNKNOWN_ERROR,
                error as Error
            )
        }

        const env = new DefaultEnvironment(
            historyMemory,
            this._randomModel.bind(this)
        )

        const agentSystem = new AgentSystem(this.ctx, env)

        agentSystem.addAgent(this._input.agent)

        const registerRunner = () => {
            const agentRunners = Object.values(service.agentRunners)

            for (const runner of agentRunners) {
                agentSystem.runner.registerNodeType(
                    runner.type,
                    runner.processor,
                    runner.ports
                )
            }
        }

        agentSystem.registerDefaultNodes()

        this.ctx.on('chatluna/agent-runner-added', () => registerRunner())

        this.ctx.on('chatluna/agent-runner-removed', () => registerRunner())

        this._agentSystem = agentSystem
        this._environment = env
    }

    private async _randomModel(requestId: string) {
        const service = this.ctx.chatluna_platform
        const [llmPlatform, llmModelName] = parseRawModelName(this._input.model)
        const currentLLMConfig = await service.randomConfig(llmPlatform)

        const currentLLMConfigKey = this._getClientConfigAsKey(currentLLMConfig)

        this._configs[requestId] = currentLLMConfig

        if (this._models[currentLLMConfigKey]) {
            return this._models[currentLLMConfigKey][0]
        }

        const [llm] = await this._initModel(
            service,
            currentLLMConfig,
            llmModelName
        )

        this._models[currentLLMConfigKey] = [llm, currentLLMConfig]

        return llm
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

        for (const [model] of Object.values(this._models)) {
            await model.clearContext()
        }

        this._models = {}

        await ctx.chatluna_conversation.deleteConversation(conversationId)
    }

    async clearChatHistory(): Promise<void> {
        if (this._chatHistory == null) {
            await this._createChatHistory()
        }

        await this._chatHistory.clear()

        for (const [model] of Object.values(this._models)) {
            await model.clearContext()
        }
    }

    private async _initEmbeddings(
        service: PlatformService
    ): Promise<ChatLunaBaseEmbeddings> {
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

        if (this._input.vectorStoreName == null) {
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

    private async _createHistoryMemory(): Promise<BufferWindowMemory> {
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
    botName?: string
    agent: Agent
    model: string
    embeddings?: string
    vectorStoreName?: string
    longMemory: boolean
    conversationId: string
    maxMessagesCount: number
}

export interface ChainEvents {
    'llm-new-token'?: (token: string) => Promise<void>
    /** Only used for chat app */
    'chat-queue-waiting'?: (size: number) => Promise<void>
    'llm-used-token-count'?: (token: number) => Promise<void>
    'llm-call-tool'?: (tool: string, args: string) => Promise<void>
}

export interface ChatInterfaceArg {
    message: HumanMessage
    events?: ChainEvents

    signal?: AbortSignal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: Record<string, any>
}

function checkRange(times: number[], delayTime: number) {
    const first = times[0]
    const last = times[times.length - 1]

    return last - first < delayTime
}
