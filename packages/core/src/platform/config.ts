import { Context } from 'cordis'
import md5 from 'md5'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/core/src/utils'

export interface ClientConfig {
    apiKey: string
    platform: string
    maxRetries: number
    concurrentMaxSize: number
    apiEndpoint?: string
    timeout: number
}

export interface ClientConfigWrapper<T extends ClientConfig = ClientConfig> {
    value: T
    isAvailable: boolean
}

export class ClientConfigPool<T extends ClientConfig = ClientConfig> {
    private _configs: ClientConfigWrapper<T>[] = []

    private _mode: ClientConfigPoolMode = ClientConfigPoolMode.AlwaysTheSame

    private _currentLoadConfigIndex = 0

    constructor(
        private ctx: Context,
        mode: ClientConfigPoolMode = ClientConfigPoolMode.AlwaysTheSame
    ) {
        this._mode = mode
    }

    async addConfig(config: T) {
        const wrapperConfig = this._createWrapperConfig(config)

        this._configs.push(wrapperConfig)

        if (wrapperConfig.isAvailable === true) {
            await this.markConfigStatus(config, true)
        }
    }

    getConfig(lockSelectConfig: boolean = false): ClientConfigWrapper<T> {
        if (this._mode === ClientConfigPoolMode.Random) {
            while (true) {
                const config =
                    this._configs[
                        Math.floor(Math.random() * this._configs.length)
                    ]

                if (config.isAvailable) {
                    return config
                }
            }
        }

        if (this._mode !== ClientConfigPoolMode.LoadBalancing) {
            for (let i = 0; i < this._configs.length; i++) {
                const config = this._configs[i]

                if (config.isAvailable) {
                    return config
                }
            }

            throw new ChatLunaError(ChatLunaErrorCode.NOT_AVAILABLE_CONFIG)
        }

        let loadConfigCount = 0
        while (true) {
            const config = this._configs[this._currentLoadConfigIndex]

            if (config.isAvailable) {
                if (!lockSelectConfig) {
                    this._currentLoadConfigIndex =
                        (this._currentLoadConfigIndex + 1) %
                        this._configs.length
                }

                return config
            }

            this._currentLoadConfigIndex =
                (this._currentLoadConfigIndex + 1) % this._configs.length

            loadConfigCount++

            if (loadConfigCount >= this._configs.length) {
                throw new ChatLunaError(ChatLunaErrorCode.NOT_AVAILABLE_CONFIG)
            }
        }
    }

    getConfigs(): readonly ClientConfigWrapper<T>[] {
        return this._configs
    }

    async markConfigStatus(config: T, isAvailable: boolean) {
        //
        const wrapper = this._configs.find((c) => c.value === config)

        wrapper.isAvailable = isAvailable
    }

    private _createWrapperConfig(config: T): ClientConfigWrapper<T> {
        return {
            value: config,

            isAvailable: true
        }
    }
}

export enum ClientConfigPoolMode {
    LoadBalancing,
    AlwaysTheSame,
    Random
}
