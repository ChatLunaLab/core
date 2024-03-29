import {
    ClientConfig,
    ModelInfo,
    ModelType,
    PlatformEmbeddingsClient,
    PlatformModelAndEmbeddingsClient,
    PlatformModelClient
} from '@chatluna/core/platform'
import {
    ChatLunaChatModel,
    ChatHubBaseEmbeddings,
    ChatLunaEmbeddings
} from '@chatluna/core/model'
import {
    MockEmbeddingsRequester,
    MockModelRequester
} from './mock_requester.ts'
import { Context } from '@cordisjs/core'

export class MockPlatformMixClient extends PlatformModelAndEmbeddingsClient {
    initError?: Error

    private _model: ModelInfo[]

    async init(): Promise<void> {
        if (this.initError) {
            throw this.initError
        }

        await this.getModels()
    }

    async getModels(): Promise<ModelInfo[]> {
        if (this.initError) {
            throw this.initError
        }

        if (this._model != null) {
            return this._model
        }

        await this.refreshModels()

        return this._model
    }

    async refreshModels(): Promise<ModelInfo[]> {
        this._model = [
            {
                name: 'mock_model',
                type: ModelType.llm
            },
            {
                name: 'mock_embeddings',
                type: ModelType.embeddings
            }
        ]
        return this._model
    }

    protected _createModel(
        model: string
    ): ChatLunaChatModel | ChatHubBaseEmbeddings {
        if (model.includes('embeddings')) {
            const mockEmbeddingRequester = new MockEmbeddingsRequester()

            return new ChatLunaEmbeddings({
                client: mockEmbeddingRequester,
                stripNewLines: false
            })
        }

        const requester = new MockModelRequester(this.ctx, this.config)

        return new ChatLunaChatModel({
            model: 'mock_model',
            modelInfo: {
                name: 'mock_model',
                type: ModelType.llm,
                maxTokens: 200
            },
            requester,
            context: this.ctx,
            ...this.getBaseCallKeys()
        })
    }
}

export class MockPlatformModelClient extends PlatformModelClient {
    initError?: Error

    returnNullInModels = false

    private _model: ModelInfo[]

    async init(): Promise<void> {
        if (this.initError) {
            throw this.initError
        }

        await this.getModels()
    }

    async getModels(): Promise<ModelInfo[]> {
        if (this.initError) {
            throw this.initError
        }

        if (this.returnNullInModels) {
            return undefined
        }

        if (this._model != null) {
            return this._model
        }

        await this.refreshModels()

        return this._model
    }

    async refreshModels(): Promise<ModelInfo[]> {
        this._model = [
            {
                name: 'mock_model',
                type: ModelType.llm
            }
        ]
        return this._model
    }

    protected _createModel(model: string): ChatLunaChatModel {
        const requester = new MockModelRequester(this.ctx, this.config)

        return new ChatLunaChatModel({
            model: 'mock_model',
            modelInfo: {
                name: 'mock_model',
                type: ModelType.llm,
                maxTokens: 200
            },
            requester,
            context: this.ctx
        })
    }
}

export class MockPlatformEmbeddingsClient extends PlatformEmbeddingsClient {
    initError?: Error

    private _model: ModelInfo[]

    async init(): Promise<void> {
        if (this.initError) {
            throw this.initError
        }

        await this.getModels()
    }

    async getModels(): Promise<ModelInfo[]> {
        if (this.initError) {
            throw this.initError
        }

        if (this._model != null) {
            return this._model
        }

        await this.refreshModels()

        return this._model
    }

    async refreshModels(): Promise<ModelInfo[]> {
        this._model = [
            {
                name: 'mock_embeddings',
                type: ModelType.embeddings
            }
        ]
        return this._model
    }

    protected _createModel(model: string): ChatHubBaseEmbeddings {
        const mockEmbeddingRequester = new MockEmbeddingsRequester()

        return new ChatLunaEmbeddings({
            client: mockEmbeddingRequester,
            stripNewLines: false,
            ...this.getBaseCallKeys()
        })
    }
}

export class MockUnavailablePlatformModelClient<
    T extends ClientConfig = ClientConfig
> extends PlatformModelClient<T> {
    initError?: Error

    throwErrorOnInit = true

    constructor(config: T, ctx?: Context, platform?: string) {
        super(config, ctx, platform)
    }

    async init(): Promise<void> {
        if (this.initError) {
            throw this.initError
        }

        throw new Error('Unavailable')
    }

    async getModels(): Promise<ModelInfo[]> {
        return undefined
    }

    async refreshModels(): Promise<ModelInfo[]> {
        return []
    }

    protected _createModel(model: string): ChatLunaChatModel {
        return undefined
    }
}
