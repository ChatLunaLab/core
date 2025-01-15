import {
    BasePlatformClient,
    ChatLunaTool,
    ClientConfig,
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
import { ChatLunaError, ChatLunaErrorCode, LRUCache } from '@chatluna/utils'
import { Context, Service } from 'cordis'
import { parseRawModelName } from '@chatluna/core/utils'
import { ChatLunaSaveableVectorStore } from '@chatluna/core/vectorstore'

export class PlatformService extends Service {
    private _platformClients: Record<string, BasePlatformClient> = {}
    private _createClientFunctions: Record<
        string,
        ContextWrapper<CreateClientFunction>
    > = {}

    private _tools: Record<string, ChatLunaTool> = {}
    private _models: Record<string, ModelInfo[]> = {}

    private _vectorStore: Record<string, CreateVectorStoreFunction> = {}

    private _tmpVectorStores = new LRUCache<ChatLunaSaveableVectorStore>(20)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(ctx: Context, config: any) {
        super(ctx, 'chatluna_platform', true)
    }

    registerClient(
        platform: string,
        createClientFunction: CreateClientFunction
    ) {
        if (this._createClientFunctions[platform]) {
            throw new Error(`Client ${platform} already exists`)
        }

        this._createClientFunctions[platform] = {
            ctx: this.ctx,
            value: createClientFunction
        }

        const disposable = () => this._unregisterClient(platform)

        return this.ctx.effect(() => disposable)
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
        delete this._models[platform]

        delete this._createClientFunctions[platform]

        const client = this._platformClients[platform]

        if (client == null) {
            return
        }

        delete this._platformClients[platform]

        if (client instanceof PlatformModelClient) {
            this.ctx.emit('chatluna/model-removed', this, platform, client)
        } else if (client instanceof PlatformEmbeddingsClient) {
            this.ctx.emit('chatluna/embeddings-removed', this, platform, client)
        } else if (client instanceof PlatformModelAndEmbeddingsClient) {
            this.ctx.emit('chatluna/embeddings-removed', this, platform, client)
            this.ctx.emit('chatluna/model-removed', this, platform, client)
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

    async createVectorStore(name: string, params: CreateVectorStoreParams) {
        const vectorStoreRetriever = this._vectorStore[name]

        if (!vectorStoreRetriever || params == null) {
            throw new Error(
                `Vector store retriever ${name} not found or params is null`
            )
        }

        const key = params.key ?? 'chatluna'

        if (this._tmpVectorStores.has(key)) {
            return this._tmpVectorStores.get(key)
        }

        const vectorStore = await vectorStoreRetriever(params)

        this._tmpVectorStores.set(key, vectorStore)

        return vectorStore
    }

    async setToolEnabledStatus(tool: string | ChatLunaTool, status: boolean) {
        if (typeof tool === 'string') {
            this._tools[tool].enabled = status
        } else {
            tool.enabled = status
        }
    }

    async randomModel<T extends ModelType = ModelType.all>(
        fullModelName: string,
        modelType: T = ModelType.all as T,
        reCreateModel: boolean = false
    ): Promise<PickModelType<T>> {
        const [platform, name] = parseRawModelName(fullModelName)

        const client = await this.getClient(platform)

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

    async getClient(platform: string) {
        return (
            this._platformClients[platform] ??
            (await this.createClient(platform))
        )
    }

    async refreshClient(client: BasePlatformClient, platform: string) {
        const isAvailable = await client.isAvailable()

        if (!isAvailable) {
            return undefined
        }

        const models = await client.getModels()

        if (models == null) {
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

    async createClient(platform: string) {
        const createClientFunctionWrapper =
            this._createClientFunctions[platform]

        if (!createClientFunctionWrapper) {
            throw new Error(
                `Create client function ${platform} not found or config is null`
            )
        }

        const client = createClientFunctionWrapper.value(
            createClientFunctionWrapper.ctx
        )

        await this.refreshClient(client, platform)

        if (!client.isAvailable()) {
            // unavailable client
            return undefined
        }

        this._platformClients[platform] = client

        return client
    }

    getTool(name: string) {
        return this._tools[name]
    }

    private _getClientConfigAsKey(config: ClientConfig) {
        return `${config.platform}/${config.apiKey}/${config.apiEndpoint}/${config.maxRetries}/${config.concurrentMaxSize}/${config.timeout}`
    }

    static inject = ['chatluna_request']
}
