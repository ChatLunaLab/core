import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import { Context, Schema } from 'cordis'

import { PlatformService, Request } from '@chatluna/core/service'
import {
    BasePlatformClient,
    ChatLunaTool,
    ClientConfig,
    ClientConfigPool,
    ClientConfigPoolMode,
    CreateVectorStoreFunction,
    ModelType
} from '@chatluna/core/platform'
import { AgentTypeRunner } from '@chatluna/core/agent'
import { ChatLunaBaseEmbeddings, ChatLunaChatModel } from '@chatluna/core/model'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class ChatLunaPlugin<T = any> {
    protected disposables: (() => void)[] = []

    abstract name: string

    protected platformService: PlatformService

    constructor(
        protected ctx: Context,
        public readonly config: T,
        readyEvent: boolean = true
    ) {
        this.platformService = ctx.chatluna_platform

        if (readyEvent) {
            ctx.on('ready', async () => {
                await this.start()
            })
        }
    }

    dispose() {
        this.disposables.forEach((disposable) => disposable())
        this.disposables.length = 0
    }

    abstract start(): Promise<void>

    registerVectorStore(name: string, func: CreateVectorStoreFunction) {
        const disposable = this.platformService.registerVectorStore(name, func)
        this.disposables.push(disposable)
    }

    registerTool(name: string, tool: ChatLunaTool) {
        const disposable = this.platformService.registerTool(name, tool)
        this.disposables.push(disposable)
    }

    registerAgentTypeRunner(runner: AgentTypeRunner) {
        const disposable = this.platformService.registerAgentRunner(runner)
        this.disposables.push(disposable)
    }

    async install() {
        await this.ctx.chatluna.installPlugin(this)
    }

    async uninstall() {
        await this.ctx.chatluna.removePlugin(this)
        this.dispose()
    }

    static inject = ['chatluna_platform', 'chatluna_request', 'chatluna']
}

export abstract class ChatLunaPlatformPlugin<
    R extends ClientConfig = ClientConfig,
    T extends ChatLunaPlatformPluginConfig = ChatLunaPlatformPluginConfig
> extends ChatLunaPlugin<T> {
    private _supportModels: string[] = []

    protected readonly _platformConfigPool: ClientConfigPool<R>

    public name: string

    protected createConfigPool = true

    protected _request: Request

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

        // inject to root ctx
        ctx.runtime.inject['cache'] = {
            required: true
        }

        super(ctx, config, false)

        this.createConfigPool = createConfigPool
        if (createConfigPool) {
            this._platformConfigPool = new ClientConfigPool<R>(
                config.configMode === 'default'
                    ? ClientConfigPoolMode.AlwaysTheSame
                    : ClientConfigPoolMode.LoadBalancing
            )
        }

        this.name = config.platform

        this.ctx.on('ready', async () => {
            await this.start()
        })
    }

    abstract parseConfig(config: T): R[]

    abstract createClient(
        ctx: Context,
        config: R
    ): BasePlatformClient<R, ChatLunaBaseEmbeddings | ChatLunaChatModel>

    async initClients() {
        this.platformService.registerConfigPool(
            this.name,
            this._platformConfigPool
        )

        try {
            await this.platformService.createClients(this.name)
        } catch (e) {
            this.uninstall()
            // await this.ctx.chatluna.unregisterPlugin(this)

            throw e
        }

        this._supportModels = this._supportModels.concat(
            this.platformService
                .getModels(this.name, ModelType.llm)
                .map((model) => `${this.name}/${model.name}`)
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

        this.platformService.registerConfigPool(platformName, pool)

        try {
            await this.platformService.createClients(platformName)
        } catch (e) {
            this.uninstall()

            throw e
        }

        this._supportModels = this._supportModels.concat(
            this.platformService
                .getModels(platformName, ModelType.llm)
                .map((model) => `${platformName}/${model.name}`)
        )
    }

    get supportedModels(): readonly string[] {
        return this._supportModels
    }

    registerConfigPool(platformName: string, configPool: ClientConfigPool) {
        this.platformService.registerConfigPool(platformName, configPool)
    }

    async registerClient(
        func: (
            ctx: Context,
            config: R
        ) => BasePlatformClient<R, ChatLunaBaseEmbeddings | ChatLunaChatModel>,
        platformName: string = this.name
    ) {
        const disposable = this.platformService.registerClient(
            platformName,
            func,
            false
        )

        this.disposables.push(disposable)
    }

    async start() {
        const parsedConfigs = this.parseConfig(this.config)

        if (parsedConfigs.length > 0 && this._platformConfigPool == null) {
            throw new ChatLunaError(
                ChatLunaErrorCode.UNKNOWN_ERROR,
                new Error('The config pool is not created')
            )
        }

        this._platformConfigPool.addConfigs(...parsedConfigs)

        switch (this.config.proxyMode) {
            case 'on':
                this._request = this.ctx.chatluna_request.create(
                    this.ctx,
                    this.config.proxyAddress
                )
                break
            case 'off':
                this._request = this.ctx.chatluna_request.create(this.ctx)
                break
            case 'system':
                this._request = this.ctx.chatluna_request.root
                break
            default:
                this._request = this.ctx.chatluna_request.root
        }

        await this.registerClient((ctx, clientConfig) => {
            return this.createClient(ctx, clientConfig)
        })

        await this.initClients()
    }

    registerVectorStore(name: string, func: CreateVectorStoreFunction) {
        const disposable = this.platformService.registerVectorStore(name, func)
        this.disposables.push(disposable)
    }

    registerTool(name: string, tool: ChatLunaTool) {
        const disposable = this.platformService.registerTool(name, tool)
        this.disposables.push(disposable)
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace

export interface ChatLunaPlatformPluginConfig {
    chatConcurrentMaxSize?: number
    timeout?: number
    configMode: string
    maxRetries: number
    proxyMode: string
    proxyAddress: string
    platform: string
}

export const ChatLunaPlatformPluginConfig: Schema<ChatLunaPlatformPluginConfig> =
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
