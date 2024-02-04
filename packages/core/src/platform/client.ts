import { Context } from 'cordis'
import { ClientConfig, ModelInfo } from '@chatluna/core/platform'
import {
    ChatHubBaseEmbeddings,
    ChatLunaChatModel
} from '@chatluna/core/model'

export abstract class BasePlatformClient<
    T extends ClientConfig = ClientConfig,
    R = ChatLunaChatModel | ChatHubBaseEmbeddings
> {
    private _modelPool: Record<string, R> = {}

    constructor(
        public config: T,
        public ctx?: Context,
        public platform: string = config.platform
    ) {
        config.concurrentMaxSize = config.concurrentMaxSize ?? 1
        config.maxRetries = config.maxRetries ?? 3
        config.timeout = config.timeout ?? 1000 * 30
    }

    async isAvailable(): Promise<boolean> {
        for (let i = 0; i < this.config.maxRetries; i++) {
            try {
                await this.init()
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

    getBaseCallKeys(): Pick<T, 'maxRetries' | 'timeout'> & {
        maxConcurrency?: number
    } {
        return {
            maxRetries: this.config.maxRetries,
            maxConcurrency: this.config.concurrentMaxSize,
            timeout: this.config.timeout
        }
    }
}

export abstract class ClearContextPlatformClient<
    T extends ClientConfig = ClientConfig,
    R = ChatLunaChatModel | ChatHubBaseEmbeddings
> extends BasePlatformClient<T, R> {
    async clearContext(): Promise<void> {}
}

export abstract class PlatformModelClient<
    T extends ClientConfig = ClientConfig
> extends ClearContextPlatformClient<T, ChatLunaChatModel> {}

export abstract class PlatformEmbeddingsClient<
    T extends ClientConfig = ClientConfig
> extends BasePlatformClient<T, ChatHubBaseEmbeddings> {}

export abstract class PlatformModelAndEmbeddingsClient<
    T extends ClientConfig = ClientConfig
> extends ClearContextPlatformClient<
    T,
    ChatLunaChatModel | ChatHubBaseEmbeddings
> {}
