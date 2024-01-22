import { Context } from 'cordis'
import { ClientConfig, ModelInfo } from '@chatluna/core/src/platform'
import {
    ChatHubBaseEmbeddings,
    ChatLunaChatModel
} from '@chatluna/core/src/model'

export abstract class BasePlatformClient<
    T extends ClientConfig = ClientConfig,
    R = ChatLunaChatModel | ChatHubBaseEmbeddings
> {
    private _modelPool: Record<string, R> = {}

    abstract platform: string

    private isInit: boolean = false

    constructor(
        public ctx: Context,
        public config: T
    ) {}

    async isAvailable(): Promise<boolean> {
        if (this.isInit) {
            return true
        }

        for (let i = 0; i < (this.config.maxRetries ?? 1); i++) {
            try {
                await this.init()
                this.isInit = true
                return true
            } catch (e) {
                if (i === this.config.maxRetries - 1) {
                    return false
                }
            }
        }
    }

    abstract init(): Promise<void>

    abstract getModels(): Promise<ModelInfo[]>

    abstract refreshModels(): Promise<ModelInfo[]>

    protected abstract _createModel(model: string): R

    createModel(model: string, reCreate?: boolean): R {
        if (!this._modelPool[model] || reCreate === true) {
            this._modelPool[model] = this._createModel(model)
        }

        return this._modelPool[model]
    }
}

export abstract class PlatformModelClient<
    T extends ClientConfig = ClientConfig
> extends BasePlatformClient<T, ChatLunaChatModel> {
    async clearContext(): Promise<void> {}
}

export abstract class PlatformEmbeddingsClient<
    T extends ClientConfig = ClientConfig
> extends BasePlatformClient<T, ChatHubBaseEmbeddings> {
    async init(): Promise<void> {}
}

export abstract class PlatformModelAndEmbeddingsClient<
    T extends ClientConfig = ClientConfig
> extends BasePlatformClient<T, ChatLunaChatModel | ChatHubBaseEmbeddings> {
    async clearContext(): Promise<void> {}
}
