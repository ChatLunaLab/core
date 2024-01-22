import { Context, Service } from 'cordis'
import {
    BasePlatformClient,
    ChatLunaChainInfo,
    ChatLunaTool,
    ClientConfig,
    ClientConfigPool,
    CreateChatLunaLLMChainParams,
    CreateVectorStoreFunction,
    CreateVectorStoreParams,
    ModelInfo,
    ModelType,
    PlatformEmbeddingsClient,
    PlatformModelAndEmbeddingsClient,
    PlatformModelClient
} from '@chatluna/core/src/platform'
import { ChatLunaLLMChainWrapper } from '@chatluna/core/src/chain'

export class PlatformService extends Service {
    private _platformClients: Record<string, BasePlatformClient> = {}
    private _createClientFunctions: Record<
        string,
        (ctx: Context, config: ClientConfig) => BasePlatformClient
    > = {}

    private _configPools: Record<string, ClientConfigPool> = {}
    private _tools: Record<string, ChatLunaTool> = {}
    private _models: Record<string, ModelInfo[]> = {}
    private _chatChains: Record<string, ChatLunaChainInfo> = {}
    private _vectorStore: Record<string, CreateVectorStoreFunction> = {}

    constructor(ctx: Context) {
        super(ctx, 'chatluna_platform')
    }

    registerClient(
        name: string,
        createClientFunction: (
            ctx: Context,
            config: ClientConfig
        ) => BasePlatformClient
    ) {
        if (this._createClientFunctions[name]) {
            throw new Error(`Client ${name} already exists`)
        }
        this._createClientFunctions[name] = createClientFunction
        return async () => await this.unregisterClient(name)
    }

    registerConfigPool(name: string, configPool: ClientConfigPool) {
        if (this._configPools[name]) {
            throw new Error(`Config pool ${name} already exists`)
        }
        this._configPools[name] = configPool
    }

    async registerTool(name: string, toolCreator: ChatLunaTool) {
        this._tools[name] = toolCreator
        await this.ctx.parallel('chatluna/tool-updated', this)
        return () => this.unregisterTool(name)
    }

    async unregisterTool(name: string) {
        delete this._tools[name]
        await this.ctx.parallel('chatluna/tool-updated', this)
    }

    async unregisterClient(platform: string) {
        const configPool = this._configPools[platform]

        if (!configPool) {
            throw new Error(`Config pool ${platform} not found`)
        }

        const configs = configPool.getConfigs()

        delete this._models[platform]
        delete this._configPools[platform]
        delete this._createClientFunctions[platform]

        for (const config of configs) {
            const client =
                this._platformClients[this._getClientConfigAsKey(config)]

            if (client == null) {
                continue
            }

            delete this._platformClients[this._getClientConfigAsKey(config)]

            if (client instanceof PlatformModelClient) {
                await this.ctx.parallel(
                    'chatluna/model-removed',
                    this,
                    platform,
                    client
                )
            } else if (client instanceof PlatformEmbeddingsClient) {
                await this.ctx.parallel(
                    'chatluna/embeddings-removed',
                    this,
                    platform,
                    client
                )
            } else if (client instanceof PlatformModelAndEmbeddingsClient) {
                await this.ctx.parallel(
                    'chatluna/embeddings-removed',
                    this,
                    platform,
                    client
                )
                await this.ctx.parallel(
                    'chatluna/model-removed',
                    this,
                    platform,
                    client
                )
            }
        }
    }

    async unregisterVectorStore(name: string) {
        delete this._vectorStore[name]

        await this.ctx.parallel('chatluna/vector-store-removed', this, name)
    }

    async registerVectorStore(
        name: string,
        vectorStoreRetrieverCreator: CreateVectorStoreFunction
    ) {
        this._vectorStore[name] = vectorStoreRetrieverCreator
        await this.ctx.parallel('chatluna/vector-store-added', this, name)
        return async () => await this.unregisterVectorStore(name)
    }

    async registerChatChain(
        name: string,
        description: string,
        createChatChainFunction: (
            params: CreateChatLunaLLMChainParams
        ) => Promise<ChatLunaLLMChainWrapper>
    ) {
        this._chatChains[name] = {
            name,
            description,
            createFunction: createChatChainFunction
        }
        await this.ctx.parallel(
            'chatluna/chat-chain-added',
            this,
            this._chatChains[name]
        )
        return async () => await this.unregisterChatChain(name)
    }

    async unregisterChatChain(name: string) {
        const chain = this._chatChains[name]
        delete this._chatChains[name]
        await this.ctx.parallel('chatluna/chat-chain-removed', this, chain)
    }

    getModels(platform: string, type: ModelType) {
        return (
            this._models[platform]?.filter(
                (m) => type === ModelType.all || m.type === type
            ) ?? []
        )
    }

    getTools() {
        return Object.keys(this._tools)
    }

    getConfigs(platform: string) {
        return this._configPools[platform]?.getConfigs() ?? []
    }

    resolveModel(platform: string, name: string) {
        return this._models[platform]?.find((m) => m.name === name)
    }

    getAllModels(type: ModelType) {
        const allModel: string[] = []

        for (const platform in this._models) {
            const models = this._models[platform]

            for (const model of models) {
                if (type === ModelType.all || model.type === type) {
                    allModel.push(platform + '/' + model.name)
                }
            }
        }

        return allModel
    }

    getVectorStoreRetrievers() {
        return Object.keys(this._vectorStore)
    }

    getChatChains() {
        return Object.values(this._chatChains)
    }

    makeConfigStatus(config: ClientConfig, isAvailable: boolean) {
        const platform = config.platform
        const pool = this._configPools[platform]

        if (!pool) {
            throw new Error(`Config pool ${platform} not found`)
        }

        return pool.markConfigStatus(config, isAvailable)
    }

    async createVectorStoreRetriever(
        name: string,
        params: CreateVectorStoreParams
    ) {
        const vectorStoreRetriever = this._vectorStore[name]

        if (!vectorStoreRetriever) {
            throw new Error(`Vector store retriever ${name} not found`)
        }

        return await vectorStoreRetriever(params)
    }

    async randomConfig(platform: string, lockConfig: boolean = false) {
        return this._configPools[platform]?.getConfig(lockConfig)
    }

    async randomClient(platform: string, lockConfig: boolean = false) {
        const config = await this.randomConfig(platform, lockConfig)

        if (!config) {
            return null
        }

        const client = await this.getClient(config)

        return client
    }

    async getClient(config: ClientConfig) {
        return (
            this._platformClients[this._getClientConfigAsKey(config)] ??
            (await this.createClient(config.platform, config))
        )
    }

    async refreshClient(
        client: BasePlatformClient,
        platform: string,
        config: ClientConfig
    ) {
        const isAvailable = await client.isAvailable()

        const pool = this._configPools[platform]

        pool.markConfigStatus(config, isAvailable)

        if (!isAvailable) {
            return null
        }

        const models = await client.getModels()

        if (models == null) {
            pool.markConfigStatus(config, false)

            return null
        }

        const availableModels = this._models[platform] ?? []

        // filter existing models
        this._models[platform] = availableModels.concat(
            models.filter(
                (m) => !availableModels.some((am) => am.name === m.name)
            )
        )

        if (client instanceof PlatformModelClient) {
            await this.ctx.parallel(
                'chatluna/model-added',
                this,
                platform,
                client
            )
        } else if (client instanceof PlatformEmbeddingsClient) {
            await this.ctx.parallel(
                'chatluna/embeddings-added',
                this,
                platform,
                client
            )
        } else if (client instanceof PlatformModelAndEmbeddingsClient) {
            await this.ctx.parallel(
                'chatluna/embeddings-added',
                this,
                platform,
                client
            )
            await this.ctx.parallel(
                'chatluna/model-added',
                this,
                platform,
                client
            )
        }
    }

    async createClient(platform: string, config: ClientConfig) {
        const createClientFunction = this._createClientFunctions[platform]

        if (!createClientFunction) {
            throw new Error(`Create client function ${platform} not found`)
        }

        const client = createClientFunction(this.ctx, config)

        await this.refreshClient(client, platform, config)

        return client
    }

    async createClients(platform: string) {
        const configPool = this._configPools[platform]

        if (!configPool) {
            throw new Error(`Config pool ${platform} not found`)
        }

        const configs = configPool.getConfigs()

        const clients: BasePlatformClient[] = []

        for (const config of configs) {
            const client = await this.createClient(platform, config)

            if (client == null) {
                continue
            }

            clients.push(client)
            this._platformClients[this._getClientConfigAsKey(config)] = client
        }

        return clients
    }

    getTool(name: string) {
        return this._tools[name]
    }

    createChatChain(name: string, params: CreateChatLunaLLMChainParams) {
        const chatChain = this._chatChains[name]

        if (!chatChain) {
            throw new Error(`Chat chain ${name} not found`)
        }

        return chatChain.createFunction(params)
    }

    private _getClientConfigAsKey(config: ClientConfig) {
        return `${config.platform}/${config.apiKey}/${config.apiEndpoint}/${config.maxRetries}/${config.concurrentMaxSize}/${config.timeout}`
    }
}
