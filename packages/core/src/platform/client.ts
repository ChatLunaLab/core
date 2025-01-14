import { ChatLunaBaseEmbeddings, ChatLunaChatModel } from '@chatluna/core/model'
import {
    ClientConfig,
    ClientConfigPool,
    ClientConfigPoolMode,
    ModelInfo
} from '@chatluna/core/platform'
import { Context } from 'cordis'
import { TTLCache } from '@chatluna/utils'

export abstract class BasePlatformClient<
    T extends ClientConfig = ClientConfig,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L = any,
    R = ChatLunaChatModel | ChatLunaBaseEmbeddings
> {
    private _modelPool: TTLCache<R>

    configPool: ClientConfigPool<T>

    private _defaultConfig: T

    constructor(
        public config: L,
        public platform: string,
        public ctx?: Context,
        configPoolMode: ClientConfigPoolMode = ClientConfigPoolMode.AlwaysTheSame
    ) {
        this.configPool = new ClientConfigPool<T>(configPoolMode)

        this.configPool.addConfigs(...this.parseConfig(config))

        this._defaultConfig = this.configPool.getConfig(true)

        /* config.concurrentMaxSize = config.concurrentMaxSize ?? 1
        config.maxRetries = config.maxRetries ?? 3
        config.timeout = config.timeout ?? 1000 * 30 */
        this._modelPool = new TTLCache<R>()

        ctx?.on('dispose', () => {
            this._modelPool.dispose()
        })
    }

    async isAvailable(): Promise<boolean> {
        for (let i = 0; i < this._defaultConfig.maxRetries; i++) {
            try {
                await this.init()
                return true
            } catch (e) {
                if (i === this._defaultConfig.maxRetries - 1) {
                    return false
                }
            }
        }
    }

    abstract init(): Promise<void>

    abstract getModels(): Promise<ModelInfo[]>

    abstract refreshModels(): Promise<ModelInfo[]>

    abstract parseConfig(config: L): T[]

    protected abstract _createModel(model: string): R

    createModel(model: string, reCreate?: boolean): R {
        if (!this._modelPool.get(model) || reCreate) {
            this._modelPool.set(model, this._createModel(model))
        }

        return this._modelPool.get(model)
    }

    getBaseCallKeys(): Pick<T, 'maxRetries' | 'timeout'> & {
        maxConcurrency?: number
    } {
        return {
            maxRetries: this._defaultConfig.maxRetries,
            maxConcurrency: this._defaultConfig.concurrentMaxSize,
            timeout: this._defaultConfig.timeout
        }
    }
}

export abstract class PlatformModelClient<
    T extends ClientConfig = ClientConfig
> extends BasePlatformClient<T, ChatLunaChatModel> {}

export abstract class PlatformEmbeddingsClient<
    T extends ClientConfig = ClientConfig
> extends BasePlatformClient<T, ChatLunaBaseEmbeddings> {}

export abstract class PlatformModelAndEmbeddingsClient<
    T extends ClientConfig = ClientConfig
> extends BasePlatformClient<T, ChatLunaChatModel | ChatLunaBaseEmbeddings> {}
