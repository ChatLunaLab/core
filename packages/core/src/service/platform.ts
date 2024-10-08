import {
    BasePlatformClient,
    ChatLunaTool,
    ClientConfig,
    ClientConfigPool,
    ContextWrapper,
    CreateClientFunction,
    CreateVectorStoreFunction,
    CreateVectorStoreParams,
    ModelInfo,
    ModelType,
    PlatformEmbeddingsClient,
    PlatformModelAndEmbeddingsClient,
    PlatformModelClient,
    PlatformModelInfo
} from '@chatluna/core/platform'
import { PickModelType } from '@chatluna/core/service'
import { ChatLunaError, ChatLunaErrorCode, Option } from '@chatluna/utils'
import { Context, Service } from 'cordis'
import { parseRawModelName } from '@chatluna/core/utils'
import { AgentTypeRunner } from '@chatluna/core/agent'

export class PlatformService extends Service {
    private _platformClients: Record<string, BasePlatformClient> = {}
    private _createClientFunctions: Record<
        string,
        ContextWrapper<CreateClientFunction>
    > = {}

    private _configPools: Record<string, ClientConfigPool> = {}
    private _tools: Record<string, ChatLunaTool> = {}
    private _models: Record<string, ModelInfo[]> = {}

    private _agentRunners: Record<string, AgentTypeRunner> = {}
    private _vectorStore: Record<string, CreateVectorStoreFunction> = {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(ctx: Context, config: any) {
        super(ctx, 'chatluna_platform', true)
    }

    registerClient(
        platform: string,
        createClientFunction: CreateClientFunction,
        registerConfigPool: boolean = true
    ) {
        if (this._createClientFunctions[platform]) {
            throw new Error(`Client ${platform} already exists`)
        }

        this._createClientFunctions[platform] = {
            ctx: this.ctx,
            value: createClientFunction
        }

        if (!this._configPools[platform] && registerConfigPool) {
            this._configPools[platform] = new ClientConfigPool()
        }

        const disposable = () => this._unregisterClient(platform)

        return this.ctx.effect(() => disposable)
    }

    registerConfigs(
        platform: string,
        ...configs: Option<ClientConfig, 'platform'>[]
    ) {
        if (!this._configPools[platform]) {
            throw new Error(`Config pool ${platform} not found`)
        }

        const values = configs.map((config) => ({
            ...config,
            platform
        }))

        this._configPools[platform].addConfigs(...values)
    }

    registerConfigPool(platform: string, configPool: ClientConfigPool) {
        if (this._configPools[platform]) {
            throw new Error(`Config pool ${platform} already exists`)
        }

        this._configPools[platform] = configPool

        return () => delete this._configPools[platform]
    }

    registerTool(name: string, toolCreator: ChatLunaTool) {
        this._tools[name] = toolCreator
        this.ctx.emit('chatluna/tool-updated', this)

        const disposable = () => this._unregisterTool(name)

        return this.ctx.effect(() => disposable)
    }

    private _unregisterTool(name: string) {
        delete this._tools[name]
        this.ctx.emit('chatluna/tool-updated', this)
    }

    private _unregisterClient(platform: string) {
        const configPool = this._configPools[platform]

        if (!configPool) {
            this.ctx.logger?.warn(`Config pool ${platform} not found`)
            return
        }

        const configs = configPool?.getConfigs() ?? []

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
                this.ctx.emit('chatluna/model-removed', this, platform, client)
            } else if (client instanceof PlatformEmbeddingsClient) {
                this.ctx.emit(
                    'chatluna/embeddings-removed',
                    this,
                    platform,
                    client
                )
            } else if (client instanceof PlatformModelAndEmbeddingsClient) {
                this.ctx.emit(
                    'chatluna/embeddings-removed',
                    this,
                    platform,
                    client
                )
                this.ctx.emit('chatluna/model-removed', this, platform, client)
            }
        }
    }

    private _unregisterVectorStore(name: string) {
        delete this._vectorStore[name]

        this.ctx.emit('chatluna/vector-store-removed', this, name)
    }

    registerVectorStore(
        name: string,
        vectorStoreCreator: CreateVectorStoreFunction
    ) {
        this._vectorStore[name] = vectorStoreCreator
        this.ctx.emit('chatluna/vector-store-added', this, name)
        const disposable = () => this._unregisterVectorStore(name)
        return this.ctx.effect(() => disposable)
    }

    registerAgentRunner(agentRunner: AgentTypeRunner) {
        const name = agentRunner.type
        this._agentRunners[name] = agentRunner
        this.ctx.emit('chatluna/agent-runner-added', this, name, agentRunner)
        const disposable = () => this._unregisterAgentRunner(name)
        return this.ctx.effect(() => disposable)
    }

    private _unregisterAgentRunner(name: string) {
        delete this._agentRunners[name]
        this.ctx.emit('chatluna/agent-runner-removed', this, name)
    }

    getModels(platform: string, type: ModelType) {
        return (
            this._models[platform]?.filter(
                (m) => type === ModelType.all || m.type === type
            ) ?? []
        )
    }

    get tools() {
        return Object.keys(this._tools)
    }

    getConfigs(platform: string) {
        return this._configPools[platform]?.getConfigs() ?? []
    }

    resolveModel(platform: string): ModelInfo
    resolveModel(platform: string, name: string): ModelInfo

    resolveModel(platform: string, name?: string): ModelInfo {
        if (name == null) {
            ;[platform, name] = parseRawModelName(platform)
        }
        return this._models[platform]?.find((m) => m.name === name)
    }

    getAllModels(type: ModelType) {
        return Object.entries(this._models)
            .flatMap((t) =>
                t[1].map((m) => ({ ...m, platform: t[0] }) as PlatformModelInfo)
            )
            .filter((m) => (type === ModelType.all ? true : m.type === type))
    }

    get vectorStores() {
        return Object.keys(this._vectorStore)
    }

    get agentRunners(): Readonly<Record<string, AgentTypeRunner>> {
        return Object.freeze({ ...this._agentRunners })
    }

    makeConfigStatus(config: ClientConfig, isAvailable: boolean) {
        const platform = config.platform
        const pool = this._configPools[platform]

        if (!pool) {
            throw new Error(`Config pool ${platform} not found`)
        }

        return pool.markConfigStatus(config, isAvailable)
    }

    async createVectorStore(name: string, params: CreateVectorStoreParams) {
        const vectorStoreRetriever = this._vectorStore[name]

        if (!vectorStoreRetriever || params == null) {
            throw new Error(
                `Vector store retriever ${name} not found or params is null`
            )
        }

        return await vectorStoreRetriever(params)
    }

    async randomConfig(platform: string, lockConfig: boolean = false) {
        return this._configPools[platform]?.getConfig(lockConfig)
    }

    async randomClient(platform: string, lockConfig: boolean = false) {
        const pool = this._configPools[platform]
        let config = await this.randomConfig(platform, lockConfig)

        while (config != null) {
            const client = await this.getClient(config)

            if (pool.isAvailable(config)) {
                return client
            }
            try {
                config = await this.randomConfig(platform, lockConfig)
            } catch (e) {
                config = undefined
            }
        }

        return undefined
    }

    async randomModel<T extends ModelType>(
        fullModelName: string,
        modelType: T = ModelType.all as T,
        lockConfig: boolean = false,
        reCreateModel: boolean = false
    ): Promise<PickModelType<T>> {
        const [platform, name] = parseRawModelName(fullModelName)

        const client = await this.randomClient(platform, lockConfig)

        const modelInfo = this.resolveModel(platform, name)

        if (client == null || modelInfo == null) {
            throw new ChatLunaError(
                ChatLunaErrorCode.MODEL_NOT_FOUND,
                `unable to resolve model ${fullModelName}`
            )
        }

        if (modelInfo.type !== modelType && modelType !== ModelType.all) {
            throw new ChatLunaError(
                ChatLunaErrorCode.MODEL_NOT_FOUND,
                `The model ${fullModelName} is not a ${modelType} model`
            )
        }

        const model = client.createModel(name, reCreateModel)

        return model as PickModelType<T>
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
            return undefined
        }

        const models = await client.getModels()

        if (models == null) {
            pool.markConfigStatus(config, false)

            return undefined
        }

        const availableModels = this._models[platform] ?? []

        // filter existing models
        this._models[platform] = availableModels.concat(
            models.filter(
                (m) => !availableModels.some((am) => am.name === m.name)
            )
        )

        if (client instanceof PlatformModelClient) {
            this.ctx.emit('chatluna/model-added', this, platform, client)
        } else if (client instanceof PlatformEmbeddingsClient) {
            this.ctx.emit('chatluna/embeddings-added', this, platform, client)
        } else if (client instanceof PlatformModelAndEmbeddingsClient) {
            this.ctx.emit('chatluna/embeddings-added', this, platform, client)
            this.ctx.emit('chatluna/model-added', this, platform, client)
        }
    }

    async createClient(platform: string, config: ClientConfig) {
        const createClientFunctionWrapper =
            this._createClientFunctions[platform]
        const configPool = this._configPools[platform]

        if (!createClientFunctionWrapper || config == null) {
            throw new Error(
                `Create client function ${platform} not found or config is null`
            )
        }

        if (!configPool.isAvailable(config)) {
            // unavailable client
            return undefined
        }

        const client = createClientFunctionWrapper.value(
            createClientFunctionWrapper.ctx,
            config
        )

        await this.refreshClient(client, platform, config)

        if (!configPool.isAvailable(config)) {
            // unavailable client
            return undefined
        }

        this._platformClients[this._getClientConfigAsKey(config)] = client

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

    private _getClientConfigAsKey(config: ClientConfig) {
        return `${config.platform}/${config.apiKey}/${config.apiEndpoint}/${config.maxRetries}/${config.concurrentMaxSize}/${config.timeout}`
    }

    static inject = ['chatluna_request']
}
