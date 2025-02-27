import {
    ChatLunaTool,
    CreateVectorStoreFunction,
    CreateVectorStoreParams
} from '@chatluna/core/platform'
import { LRUCache, RequestIdQueue } from '@chatluna/utils'
import { Context, Service } from 'cordis'
import { parseRawModelName } from '@chatluna/core/utils'
import { ModelType, PlatformModelInfo, SaveableVectorStore } from 'cortexluna'

export class PlatformService extends Service {
    private _tools: Record<string, ChatLunaTool> = {}
    private _models: Record<string, PlatformModelInfo[]> = {}

    private _vectorStore: Record<string, CreateVectorStoreFunction> = {}

    private _tmpVectorStores = new LRUCache<SaveableVectorStore>(20)
    private _modelQueue = new RequestIdQueue()
    private _conversationQueue = new RequestIdQueue()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(ctx: Context, config: any) {
        super(ctx, 'chatluna_platform', true)

        ctx.on('cortexluna/provider-updated', async (service) => {
            this._models = await service.models().then((m) => {
                return m.reduce(
                    (acc, m) => {
                        acc[m.provider] = [...(acc[m.provider] ?? []), m]
                        return acc
                    },
                    {} as Record<string, PlatformModelInfo[]>
                )
            })
        })
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
        return this._models[platform]?.filter((m) => m.type === type) ?? []
    }

    get tools() {
        return Object.keys(this._tools)
    }

    resolveModel(platform: string): PlatformModelInfo
    resolveModel(platform: string, name: string): PlatformModelInfo

    resolveModel(platform: string, name?: string): PlatformModelInfo {
        if (name == null) {
            ;[platform, name] = parseRawModelName(platform)
        }
        return this._models[platform]?.find((m) => m.name === name)
    }

    getAllModels(type: ModelType) {
        return Object.entries(this._models)
            .flatMap(([, models]) => models)
            .filter((m) => m.type === type)
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

    getTool(name: string) {
        return this._tools[name]
    }

    get conversationQueue() {
        return this._conversationQueue
    }

    get modelQueue() {
        return this._modelQueue
    }

    static inject = ['chatluna_request']
}
