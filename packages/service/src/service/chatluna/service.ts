import { Context, Service } from 'cordis'
import { ChatLunaPlugin } from './plugin.ts'
import {
    ChatMiddlewareExecutor,
    ChatMiddlewareGraph
} from '@chatluna/chat/middleware'
import { ChatInterfaceInput } from '@chatluna/chat/chat'
import { ChainEvents } from '@chatluna/core/chain'
import { VectorStoreRetrieverMemory } from '@chatluna/core/memory'
import { ChatLunaBaseEmbeddings, ChatLunaChatModel } from '@chatluna/core/model'
import { parseRawModelName } from '@chatluna/core/utils'
import { ChatLunaConversation } from '@chatluna/memory/types'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import { HumanMessage } from '@langchain/core/messages'
import { ChatInterfaceWrapper } from './chat.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatLunaService extends Service {
    private _plugins: ChatLunaPlugin[] = []
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
    async installPlugin(plugin: ChatLunaPlugin<any>) {
        if (this._plugins.find((p) => p.name === plugin.name)) {
            throw new ChatLunaError(
                ChatLunaErrorCode.UNKNOWN_ERROR,
                new Error(`The plugin ${plugin.name} already installed`)
            )
        }

        this._plugins.push(plugin)
        this.ctx.logger.success(`register plugin %c`, plugin.name)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async removePlugin(plugin: ChatLunaPlugin<any>) {
        this._plugins.splice(this._plugins.indexOf(plugin), 1)

        plugin.dispose()

        this.ctx.logger.success('unregister plugin %c', plugin.name)
    }

    findPlugin(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fun: (plugin: ChatLunaPlugin<any>) => boolean
    ): ChatLunaPlugin {
        return this._plugins.find(fun)
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

    async createModel(
        platformWithModel: string
    ): Promise<ChatLunaChatModel | ChatLunaBaseEmbeddings>

    async createModel(
        platformName: string,
        model: string
    ): Promise<ChatLunaChatModel | ChatLunaBaseEmbeddings>

    async createModel(platformName: string, model?: string) {
        const service = this.ctx.chatluna_platform

        if (model == null) {
            ;[platformName, model] = parseRawModelName(platformName)
        }

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

    private async _createTempDir() {
        try {
            const path = await import('path')
            const fs = await import('fs')
            // create dir data/chathub/temp use fs
            // ?
            const tempPath = path.resolve(
                this.ctx.baseDir,
                'data/chatluna/temp'
            )
            if (!fs.existsSync(tempPath)) {
                fs.mkdirSync(tempPath, { recursive: true })
            }
        } catch (e) {
            this.ctx.logger.error(e)
        }
    }

    middlewareExecutor<T, R>() {
        return this._chatMiddlewareExecutor as ChatMiddlewareExecutor<T, R>
    }
}

declare module 'cordis' {
    interface Context {
        chatluna: ChatLunaService
    }
}
