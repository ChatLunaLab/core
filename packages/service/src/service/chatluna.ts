import { Context, Schema, Service } from 'cordis'
import { PlatformService } from '@chatluna/core/service'
import { ChatLunaConversation } from '@chatluna/memory/types'
import { ChatInterface, ChatInterfaceInput } from '@chatluna/chat/chat'
import { ChatLunaError, ChatLunaErrorCode, RequestQueue } from '@chatluna/utils'
import crypto from 'crypto'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { ChainEvents, ChatLunaLLMChainWrapper } from '@chatluna/core/chain'
import { VectorStoreRetrieverMemory } from '@chatluna/core/memory'
import { parseRawModelName } from '@chatluna/core/utils'
import {
    BasePlatformClient,
    ChatLunaTool,
    ClientConfig,
    ClientConfigPool,
    ClientConfigPoolMode,
    CreateChatLunaLLMChainParams,
    CreateVectorStoreFunction,
    ModelType
} from '@chatluna/core/platform'
import { ChatLunaBaseEmbeddings, ChatLunaChatModel } from '@chatluna/core/model'
import {
    ChatMiddlewareExecutor,
    ChatMiddlewareGraph
} from '@chatluna/chat/middleware'
import path from 'path'
import fs from 'fs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatLunaService extends Service {
    private _platformPlugins: ChatLunaPlatformPlugin[] = []
    private _chatInterfaceWrapper: Record<string, ChatInterfaceWrapper> = {}
    // private _lock = new ObjectLock()
    private readonly _chatMiddlewareExecutor: ChatMiddlewareExecutor

    constructor(ctx: Context) {
        super(ctx, 'chatluna')

        this._chatMiddlewareExecutor = new ChatMiddlewareExecutor(
            ctx,
            new ChatMiddlewareGraph()
        )

        this._createTempDir()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async installPlatformPlugin(plugin: ChatLunaPlatformPlugin<any, any>) {
        if (
            this._platformPlugins.find(
                (p) => p.platformName === plugin.platformName
            )
        ) {
            throw new ChatLunaError(
                ChatLunaErrorCode.UNKNOWN_ERROR,
                new Error(`The plugin ${plugin.platformName} already installed`)
            )
        }

        this._platformPlugins.push(plugin)
        this.ctx.logger.success(`register plugin %c`, plugin.platformName)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async removePlatformPlugin(plugin: ChatLunaPlatformPlugin<any, any>) {
        this._platformPlugins.splice(this._platformPlugins.indexOf(plugin), 1)

        this.ctx.logger.success('unregister plugin %c', plugin.platformName)
    }

    findPlugin(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fun: (plugin: ChatLunaPlatformPlugin<any, any>) => boolean
    ): ChatLunaPlatformPlugin {
        return this._platformPlugins.find(fun)
    }

    chat(
        conversation: ChatLunaConversation,
        message: HumanMessage,
        event: ChainEvents,
        stream: boolean = false,
        signal?: AbortSignal,
        chatMemory?: VectorStoreRetrieverMemory,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params?: Record<string, any>
    ) {
        const { model: modelName } = conversation

        // provider
        const [platform] = parseRawModelName(modelName)

        const chatInterfaceWrapper = this._chatInterfaceWrapper[platform]

        if (chatInterfaceWrapper == null) {
            throw new ChatLunaError(
                ChatLunaErrorCode.MODEL_ADAPTER_NOT_FOUND,
                new Error(`The platform ${platform} no available`)
            )
        }

        return chatInterfaceWrapper.chat(
            conversation,
            message,
            event,
            stream,
            signal,
            chatMemory,
            params
        )
    }

    queryInterfaceWrapper(
        conversation: ChatLunaConversation
    ): ChatInterfaceWrapper | undefined {
        const { model: modelName } = conversation

        // provider
        const [platform] = parseRawModelName(modelName)

        return this._chatInterfaceWrapper[platform]
    }

    async clearChatHistory(conversation: ChatLunaConversation) {
        const { model: modelName } = conversation

        // provider
        const [platformName] = parseRawModelName(modelName)

        const chatBridger = this._chatInterfaceWrapper[platformName]

        return chatBridger?.clearChatHistory(conversation)
    }

    getCachedInterfaceWrappers() {
        return Object.values(this._chatInterfaceWrapper)
    }

    async clearCache(conversation: ChatLunaConversation) {
        const { model: modelName } = conversation

        // provider
        const [platformName] = parseRawModelName(modelName)

        const chatBridger = this._chatInterfaceWrapper[platformName]

        return chatBridger?.clearCache(conversation)
    }

    async createModel(platformName: string, model: string) {
        const service = this.ctx.chatluna_platform

        const client = await service.randomClient(platformName)

        if (client == null) {
            throw new ChatLunaError(
                ChatLunaErrorCode.MODEL_ADAPTER_NOT_FOUND,
                new Error(`The platform ${platformName} no available`)
            )
        }

        return client.createModel(model)
    }

    async createEmbeddings(platformName: string, modelName: string) {
        const service = this.ctx.chatluna_platform

        const client = await service.randomClient(platformName)

        if (client == null) {
            throw new ChatLunaError(
                ChatLunaErrorCode.MODEL_ADAPTER_NOT_FOUND,
                new Error(`The platform ${platformName} no available`)
            )
        }

        const model = client.createModel(modelName)

        if (model instanceof ChatLunaBaseEmbeddings) {
            return model
        }

        throw new ChatLunaError(
            ChatLunaErrorCode.MODEL_NOT_FOUND,
            new Error(`The model ${modelName} is not embeddings`)
        )
    }

    createChatInterfaceWrapper(
        platform: string,
        input: ChatInterfaceInput
    ): ChatInterfaceWrapper {
        const chatBridger = new ChatInterfaceWrapper(this.ctx, input)
        this.ctx.logger.debug(`create platform %c`, platform)
        this._chatInterfaceWrapper[platform] = chatBridger
        return chatBridger
    }

    private _createTempDir() {
        // create dir data/chathub/temp use fs
        // ?
        const tempPath = path.resolve(this.ctx.baseDir, 'data/chatluna/temp')
        if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath, { recursive: true })
        }
    }

    middlewareExecutor<T, R>() {
        return this._chatMiddlewareExecutor as ChatMiddlewareExecutor<T, R>
    }
}

export class ChatLunaPlatformPlugin<
    R extends ClientConfig = ClientConfig,
    T extends ChatLunaPlatformPlugin.Config = ChatLunaPlatformPlugin.Config
> {
    private _disposables: (() => void)[] = []

    private _supportModels: string[] = []

    private readonly _platformConfigPool: ClientConfigPool<R>

    private _platformService: PlatformService

    public platformName: string

    constructor(
        protected ctx: Context,
        public readonly config: T,
        createConfigPool: boolean = true
    ) {
        if (config.platform == null || config.platform.length < 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.UNKNOWN_ERROR,
                new Error('Cannot find any platform')
            )
        }

        ctx.once('dispose', async () => {
            ctx.chatluna.removePlatformPlugin(this)
        })

        // inject to root ctx
        ctx.runtime.inject['cache'] = {
            required: true
        }

        if (createConfigPool) {
            this._platformConfigPool = new ClientConfigPool<R>(
                config.configMode === 'default'
                    ? ClientConfigPoolMode.AlwaysTheSame
                    : ClientConfigPoolMode.LoadBalancing
            )
        }

        this._platformService = ctx.chatluna_platform
        this.platformName = config.platform
    }

    parseConfig(f: (config: T) => R[]) {
        const configs = f(this.config)

        for (const config of configs) {
            this._platformConfigPool.addConfig(config)
        }
    }

    install() {
        this.ctx.chatluna.installPlatformPlugin(this)
    }

    async initClients() {
        this._platformService.registerConfigPool(
            this.platformName,
            this._platformConfigPool
        )

        try {
            await this._platformService.createClients(this.platformName)
        } catch (e) {
            this.uninstall()
            // await this.ctx.chatluna.unregisterPlugin(this)

            throw e
        }

        this._supportModels = this._supportModels.concat(
            this._platformService
                .getModels(this.platformName, ModelType.llm)
                .map((model) => `${this.platformName}/${model.name}`)
        )

        this.install()
    }

    async initClientsWithPool<A extends ClientConfig = R>(
        platformName: string,
        pool: ClientConfigPool<A>,
        createConfigFunc: (config: T) => A[]
    ) {
        const configs = createConfigFunc(this.config)

        for (const config of configs) {
            pool.addConfig(config)
        }

        this._platformService.registerConfigPool(platformName, pool)

        try {
            await this._platformService.createClients(platformName)
        } catch (e) {
            this.uninstall()

            throw e
        }

        this._supportModels = this._supportModels.concat(
            this._platformService
                .getModels(platformName, ModelType.llm)
                .map((model) => `${platformName}/${model.name}`)
        )
    }

    get supportedModels(): readonly string[] {
        return this._supportModels
    }

    uninstall() {
        while (this._disposables.length > 0) {
            const disposable = this._disposables.pop()
            disposable()
        }
        this.ctx.chatluna.removePlatformPlugin(this)
    }

    registerConfigPool(platformName: string, configPool: ClientConfigPool) {
        this._platformService.registerConfigPool(platformName, configPool)
    }

    async registerClient(
        func: (
            ctx: Context,
            config: R
        ) => BasePlatformClient<R, ChatLunaBaseEmbeddings | ChatLunaChatModel>,
        platformName: string = this.platformName
    ) {
        const disposable = this._platformService.registerClient(
            platformName,
            func,
            false
        )

        this._disposables.push(disposable)
    }

    registerVectorStore(name: string, func: CreateVectorStoreFunction) {
        const disposable = this._platformService.registerVectorStore(name, func)
        this._disposables.push(disposable)
    }

    registerTool(name: string, tool: ChatLunaTool) {
        const disposable = this._platformService.registerTool(name, tool)
        this._disposables.push(disposable)
    }

    registerChatChainProvider(
        name: string,
        description: string,
        func: (
            params: CreateChatLunaLLMChainParams
        ) => Promise<ChatLunaLLMChainWrapper>
    ) {
        const disposable = this._platformService.registerChatChain(
            name,
            description,
            func
        )
        this._disposables.push(disposable)
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ChatLunaPlatformPlugin {
    export interface Config {
        chatConcurrentMaxSize?: number
        timeout?: number
        configMode: string
        maxRetries: number
        proxyMode: string
        proxyAddress: string
        platform: string
    }

    export const Config: Schema<ChatLunaPlatformPlugin.Config> =
        Schema.intersect([
            Schema.object({
                chatConcurrentMaxSize: Schema.number()
                    .min(1)
                    .max(8)
                    .default(3)
                    .description('请求的最大并发数'),

                configMode: Schema.union([
                    Schema.const('default').description(
                        '顺序配置（当配置无效后自动弹出配置，切换到下一个可用配置）'
                    ),
                    Schema.const('balance').description(
                        '负载均衡（所有可用配置轮询使用）'
                    )
                ])
                    .default('default')
                    .description('请求配置模式'),
                maxRetries: Schema.number()
                    .description('请求失败后的最大重试次数')
                    .min(1)
                    .max(6)
                    .default(3),
                timeout: Schema.number()
                    .description('模型请求超时时间(毫秒)')
                    .default(300 * 1000),

                proxyMode: Schema.union([
                    Schema.const('system').description('跟随全局代理'),
                    Schema.const('off').description('不使用代理'),
                    Schema.const('on').description('覆盖全局代理')
                ])
                    .description('代理设置模式')
                    .default('system')
            }).description('全局设置'),

            Schema.union([
                Schema.object({
                    proxyMode: Schema.const('on').required(),
                    proxyAddress: Schema.string()
                        .description(
                            '网络请求的代理地址，填写后当前插件的网络服务都将使用该代理地址。如不填写会尝试使用全局配置里的代理设置'
                        )
                        .default('')
                }).description('代理设置'),
                Schema.object({})
            ])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ]) as any
}

type ChatLunaChatBridgerInfo = {
    chatInterface: ChatInterface
    room: ChatLunaConversation
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ChatInterfaceWrapper {
    private _conversations: Record<string, ChatLunaChatBridgerInfo> = {}

    private _modelQueue = new RequestQueue()
    private _conversationQueue = new RequestQueue()
    private _platformService: PlatformService

    constructor(
        private _ctx: Context,
        private _input: ChatInterfaceInput
    ) {
        this._platformService = this._ctx.chatluna_platform
    }

    async chat(
        room: ChatLunaConversation,
        message: HumanMessage,
        event: ChainEvents,
        stream: boolean,
        signal?: AbortSignal,
        chatMemory?: VectorStoreRetrieverMemory,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params?: Record<string, any>
    ): Promise<AIMessage> {
        const { id: conversationId, model: fullModelName } = room

        const [platform] = parseRawModelName(fullModelName)

        const config = this._platformService.getConfigs(platform)[0]

        const requestId = crypto.randomUUID()

        const maxQueueLength = config.concurrentMaxSize
        const currentQueueLength =
            await this._modelQueue.getQueueLength(platform)

        await this._conversationQueue.add(conversationId, requestId, signal)
        await this._modelQueue.add(platform, requestId, signal)

        await event['llm-queue-waiting'](currentQueueLength)

        await this._modelQueue.wait(platform, requestId, maxQueueLength)

        try {
            const { chatInterface } =
                this._conversations[conversationId] ??
                (await this._createChatInterface(room))

            const humanMessage = new HumanMessage({
                content: message.content,
                name: message.name,
                additional_kwargs: message.additional_kwargs
            })

            const chainValues = await chatInterface.chat({
                message: humanMessage,
                events: event,
                stream,
                signal,
                chatMemory,
                params
            })

            return chainValues.message as AIMessage
        } finally {
            await this._modelQueue.remove(platform, requestId)
            await this._conversationQueue.remove(conversationId, requestId)
        }
    }

    async query(conversation: ChatLunaConversation): Promise<ChatInterface> {
        const { id } = conversation

        const { chatInterface } =
            this._conversations[id] ??
            (await this._createChatInterface(conversation))

        return chatInterface
    }

    async clearChatHistory(conversation: ChatLunaConversation) {
        const { id: conversationId } = conversation

        const chatInterface = await this.query(conversation)

        if (chatInterface == null) {
            return
        }

        // uuid
        const requestId = crypto.randomUUID()
        await this._conversationQueue.wait(conversationId, requestId, 0)
        await chatInterface.clearChatHistory()
        delete this._conversations[conversationId]
        await this._conversationQueue.remove(conversationId, requestId)
    }

    async clearCache(room: ChatLunaConversation | string) {
        let conversationId: string

        if (typeof room === 'string') {
            conversationId = room
        } else {
            conversationId = room.id
        }

        const requestId = crypto.randomUUID()
        await this._conversationQueue.wait(conversationId, requestId, 0)

        delete this._conversations[conversationId]

        await this._conversationQueue.remove(conversationId, requestId)
    }

    getCacheConversations() {
        return Object.keys(this._conversations).map(
            (conversationId) =>
                [conversationId, this._conversations[conversationId]] as [
                    string,
                    ChatLunaChatBridgerInfo
                ]
        )
    }

    async delete(room: ChatLunaConversation) {
        const { id: conversationId } = room

        const chatInterface = await this.query(room)

        if (chatInterface == null) {
            return
        }

        const requestId = crypto.randomUUID()
        await this._conversationQueue.wait(conversationId, requestId, 1)
        await chatInterface.delete(this._ctx, room)
        await this._conversationQueue.remove(conversationId, requestId)
        await this.clearCache(room)
    }

    dispose() {
        this._conversations = {}
    }

    private async _createChatInterface(
        room: ChatLunaConversation
    ): Promise<ChatLunaChatBridgerInfo> {
        const chatInterface = new ChatInterface(this._ctx.root, this._input)

        const result = {
            chatInterface,
            room
        }

        this._conversations[room.id] = result

        return result
    }
}

declare module 'cordis' {
    interface Context {
        chatluna: ChatLunaService
    }
}
