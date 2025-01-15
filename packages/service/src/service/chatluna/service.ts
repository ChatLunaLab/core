import { Context, Service } from 'cordis'
import { ChatLunaPlugin } from './plugin.ts'
import {
    ChatMiddlewareExecutor,
    ChatMiddlewareGraph
} from '@chatluna/chat/middleware'
import { ChatLunaBaseEmbeddings, ChatLunaChatModel } from '@chatluna/core/model'
import { parseRawModelName } from '@chatluna/core/utils'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatLunaService extends Service {
    private _plugins: ChatLunaPlugin[] = []

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
    installPlugin(plugin: ChatLunaPlugin<any>) {
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
    removePlugin(plugin: ChatLunaPlugin<any>) {
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

        const client = await service.createClient(platformName)

        if (client == null) {
            throw new ChatLunaError(
                ChatLunaErrorCode.MODEL_ADAPTER_NOT_FOUND,
                new Error(`The platform ${platformName} no available`)
            )
        }

        return client.createModel(model)
    }

    async createEmbeddings(
        platformWithModel: string
    ): Promise<ChatLunaChatModel | ChatLunaBaseEmbeddings>

    async createEmbeddings(
        platformName: string,
        model: string
    ): Promise<ChatLunaChatModel | ChatLunaBaseEmbeddings>

    async createEmbeddings(platformName: string, modelName?: string) {
        const service = this.ctx.chatluna_platform

        if (modelName == null) {
            ;[platformName, modelName] = parseRawModelName(platformName)
        }

        const client = await service.createClient(platformName)

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
