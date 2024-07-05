import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'

export interface ClientConfig {
    apiKey: string
    platform: string
    maxRetries?: number
    concurrentMaxSize?: number
    apiEndpoint?: string
    timeout?: number
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
        mode: ClientConfigPoolMode = ClientConfigPoolMode.AlwaysTheSame
    ) {
        this._mode = mode
    }

    addConfig(config: T) {
        if (config.concurrentMaxSize == null) {
            config.concurrentMaxSize = 1
        }

        if (config.maxRetries == null) {
            config.maxRetries = 3
        }

        if (config.timeout == null) {
            config.timeout = 120 * 60 * 1000
        }

        // find the existing config
        const existed = this._configs.find((old) => {
            return (
                old.value.apiKey === config.apiKey &&
                old.value.platform === config.platform &&
                old.value.apiEndpoint === config.apiEndpoint
            )
        })

        if (existed) {
            throw new ChatLunaError(ChatLunaErrorCode.ADD_EXISTING_CONFIG)
        }

        const wrapperConfig = this._createWrapperConfig(config)

        this._configs.push(wrapperConfig)

        if (wrapperConfig.isAvailable === true) {
            this.markConfigStatus(config, true)
        }

        return config
    }

    addConfigs(...configs: T[]) {
        for (const config of configs) {
            this.addConfig(config)
        }

        return configs
    }

    getConfig(lockSelectConfig: boolean = false): T {
        if (this._mode === ClientConfigPoolMode.Random) {
            const availedConfigs = this._configs.filter(
                (config) => config.isAvailable
            )

            if (availedConfigs.length === 0) {
                throw new ChatLunaError(ChatLunaErrorCode.NOT_AVAILABLE_CONFIG)
            }

            while (true) {
                const config =
                    availedConfigs[
                        Math.floor(Math.random() * availedConfigs.length)
                    ]

                if (config.isAvailable) {
                    return config.value
                }
            }
        }

        if (this._mode !== ClientConfigPoolMode.LoadBalancing) {
            for (let i = 0; i < this._configs.length; i++) {
                const config = this._configs[i]

                if (config.isAvailable) {
                    return config.value
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

                return config.value
            }

            this._currentLoadConfigIndex =
                (this._currentLoadConfigIndex + 1) % this._configs.length

            loadConfigCount++

            if (loadConfigCount >= this._configs.length) {
                throw new ChatLunaError(ChatLunaErrorCode.NOT_AVAILABLE_CONFIG)
            }
        }
    }

    getConfigs(): T[] {
        return this._configs.map((c) => c.value)
    }

    isAvailable(config: T): boolean {
        const wrapper = this._configs.find((c) => c.value === config)

        return wrapper.isAvailable
    }

    markConfigStatus(config: T, isAvailable: boolean) {
        //
        const wrapper = this._configs.find((c) => c.value === config)

        wrapper.isAvailable = isAvailable
    }

    set mode(mode: ClientConfigPoolMode) {
        this._mode = mode
    }

    get mode(): ClientConfigPoolMode {
        return this._mode
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
