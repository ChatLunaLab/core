import { Context, Service } from 'cordis'
import { PlatformService } from '@chatluna/core/service'
import { ChatLunaConversation } from '@chatluna/memory/types'
import { ChatInterface, ChatInterfaceInput } from '@chatluna/chat/chat'
import { ObjectLock, RequestQueue } from '@chatluna/utils'
import crypto from 'crypto'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { ChainEvents, ChatLunaLLMChainWrapper } from '@chatluna/core/chain'
import { VectorStoreRetrieverMemory } from '@chatluna/core/memory'
import { parseRawModelName, PromiseLikeDisposable } from '@chatluna/core/utils'
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
import { ChatLunaChatModel, ChatLunaEmbeddings } from '@chatluna/core/model'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatLunaService extends Service {
    private _platformPlugins: ChatLunaPlatformPlugin[] = []
    private _chatInterfaceWrapper: Record<string, ChatInterfaceWrapper> = {}
    private _lock = new ObjectLock()
    private readonly _chatMiddlewareExecutor: ChatMiddlewareExecutor

    constructor(ctx: Context) {
        super(ctx, 'chatluna')
    }
}

export class ChatLunaPlatformPlugin<
    R extends ClientConfig = ClientConfig,
    T extends ChatLunaPlatformPlugin.Config = ChatLunaPlatformPlugin.Config
> {
    private _disposables: PromiseLikeDisposable[] = []

    private _supportModels: string[] = []

    private readonly _platformConfigPool: ClientConfigPool<R>

    private _platformService: PlatformService

    constructor(
        protected ctx: Context,
        public readonly config: T,
        public platformName: string,
        createConfigPool: boolean = true
    ) {
        ctx.once('dispose', async () => {
            // await ctx.chatluna.unregisterPlugin(this)
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
    }

    parseConfig(f: (config: T) => R[]) {
        const configs = f(this.config)

        for (const config of configs) {
            this._platformConfigPool.addConfig(config)
        }
    }

    async initClients() {
        this._platformService.registerConfigPool(
            this.platformName,
            this._platformConfigPool
        )

        try {
            await this._platformService.createClients(this.platformName)
        } catch (e) {
            await this.onDispose()
            // await this.ctx.chatluna.unregisterPlugin(this)

            throw e
        }

        this._supportModels = this._supportModels.concat(
            this._platformService
                .getModels(this.platformName, ModelType.llm)
                .map((model) => `${this.platformName}/${model.name}`)
        )

        //  this.ctx.chatluna.registerPlugin(this)
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
            await this.onDispose()

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

    async onDispose(): Promise<void> {
        while (this._disposables.length > 0) {
            const disposable = this._disposables.pop()
            await disposable()
        }
    }

    registerConfigPool(platformName: string, configPool: ClientConfigPool) {
        this._platformService.registerConfigPool(platformName, configPool)
    }

    async registerClient(
        func: (
            ctx: Context,
            config: R
        ) => BasePlatformClient<R, ChatLunaEmbeddings | ChatLunaChatModel>,
        platformName: string = this.platformName
    ) {
        const disposable = this._platformService.registerClient(
            platformName,
            func
        )

        this._disposables.push(disposable)
    }

    async registerVectorStore(name: string, func: CreateVectorStoreFunction) {
        const disposable = this._platformService.registerVectorStore(name, func)
        this._disposables.push(disposable)
    }

    async registerTool(name: string, tool: ChatLunaTool) {
        const disposable = this._platformService.registerTool(name, tool)
        this._disposables.push(disposable)
    }

    async registerChatChainProvider(
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
        configMode: string
    }
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
        private _service: ChatLunaService,
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
