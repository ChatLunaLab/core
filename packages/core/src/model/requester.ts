import { Request, RequestInit } from '@chatluna/core/service'
import { ChatLunaError, ChatLunaErrorCode, Option } from '@chatluna/utils'
import { Logger } from '@cordisjs/logger'
import { BaseMessage } from '@langchain/core/messages'
import { ChatGeneration, ChatGenerationChunk } from '@langchain/core/outputs'
import { StructuredTool } from '@langchain/core/tools'
import { ClientRequestArgs } from 'http'
import { ClientOptions, WebSocket } from 'ws'
import { ClientConfig, ClientConfigPool } from '@chatluna/core/platform'

export interface BaseRequestParams<T extends ClientConfig = ClientConfig> {
    /**
     * Timeout to use when making request. Only useful when using ChatLunaModel
     */
    timeout?: number
    /**
     ** The signal to use for cancellation. Only useful when using ChatLunaModel
     **/
    signal?: AbortSignal

    /** Model name to use */
    model?: string

    config?: T
}

export interface ModelRequestParams<T extends ClientConfig = ClientConfig>
    extends BaseRequestParams<T> {
    /** Sampling temperature to use */
    temperature?: number

    /**
     * Maximum number of tokens to generate in the completion. -1 returns as many
     * tokens as possible given the prompt and the model's maximum context size.
     */
    maxTokens?: number

    /** Total probability mass of tokens to consider at each step */
    topP?: number

    /** Penalizes repeated tokens according to frequency */
    frequencyPenalty?: number

    /** Penalizes repeated tokens */
    presencePenalty?: number

    /** Number of completions to generate for each prompt */
    n?: number

    /** Dictionary used to adjust the probability of specific tokens being generated */
    logitBias?: Record<string, number>

    /** Unique string identifier representing your end-user, which can help OpenAI to monitor and detect abuse. */
    user?: string

    /** List of stop words to use when generating */
    stop?: string[] | string

    /**
     * Input messages to use for model completion.
     */
    input: BaseMessage[]

    id?: string

    tools?: StructuredTool[]
}

export interface EmbeddingsRequestParams<T extends ClientConfig = ClientConfig>
    extends BaseRequestParams<T> {
    input: string | string[]
}

export abstract class BaseRequester<T extends ClientConfig = ClientConfig> {
    private _config?: T

    private _configPool?: ClientConfigPool<T>

    private _errorCountsMap: Record<string, number[]> = {}

    constructor(
        config:
            | ClientConfigPool<T>
            | (Option<T, 'platform'> & { apiEndpoint: string }),
        request?: Request,
        public _logger?: Logger
    ) {
        if (config instanceof ClientConfigPool) {
            this._configPool = config
        } else {
            this._config = config as T
        }
    }

    get config() {
        if (this._configPool == null && this._config != null) {
            return this._config
        }

        if (this._configPool != null) {
            return this._configPool.getConfig()
        }

        throw new ChatLunaError(ChatLunaErrorCode.NOT_AVAILABLE_CONFIG)
    }

    get configLocked() {
        if (this._configPool == null && this._config != null) {
            return this._config
        }

        if (this._configPool != null) {
            return this._configPool.getConfig(true)
        }

        throw new ChatLunaError(ChatLunaErrorCode.NOT_AVAILABLE_CONFIG)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected async _runCatch<R>(
        func: () => Promise<R>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: any,
        config?: T
    ): Promise<R> {
        const configMD5 = this._configPool.getClientConfigAsKey(config)
        try {
            const result = await func()

            delete this._errorCountsMap[configMD5]
            return result

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            this._errorCountsMap[configMD5] =
                this._errorCountsMap[configMD5] ?? []
            const errorTimes = this._errorCountsMap[configMD5]

            // Add current error timestamp
            errorTimes.push(Date.now())

            // Keep only recent errors
            if (errorTimes.length > config.maxRetries * 3) {
                this._errorCountsMap[configMD5] = errorTimes.slice(
                    -config.maxRetries * 3
                )
            }

            // Check if we need to disable the config
            const recentErrors = errorTimes.slice(-config.maxRetries)
            if (
                recentErrors.length >= config.maxRetries &&
                checkRange(recentErrors, 1000 * 60 * 20)
            ) {
                this._configPool?.markConfigStatus(config, false)
            }

            if (e instanceof ChatLunaError) {
                throw e
            }
            const error = new Error(
                'error when request, Result: ' + JSON.stringify(data)
            )

            error.stack = e.stack
            error.cause = e.cause
            this._logger.debug(e)

            throw new ChatLunaError(ChatLunaErrorCode.API_REQUEST_FAILED, error)
        }
    }

    abstract init(): Promise<void>

    abstract dispose(): Promise<void>
}

export abstract class ModelRequester<
    T extends ClientConfig = ClientConfig
> extends BaseRequester<T> {
    async completion(params: ModelRequestParams<T>): Promise<ChatGeneration> {
        const stream = this.completionStream(params)

        // get final result
        let result: ChatGenerationChunk

        for await (const chunk of stream) {
            result = result != null ? result.concat(chunk) : chunk
        }

        return result
    }

    abstract completionStream(
        params: ModelRequestParams<T>
    ): AsyncGenerator<ChatGenerationChunk>

    async init(): Promise<void> {}

    async dispose(): Promise<void> {}
}

// The abstract class for requesters, no need to test
/* c8 ignore next 120 */
export interface WithRequest {
    requestService: Request
}

interface HttpRequest extends WithRequest {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _post(url: string, data: any, params: RequestInit): Promise<Response>

    _get(url: string): Promise<Response>

    _buildHeaders(): Record<string, string>

    _concatUrl(url: string): string
}

export interface WebSocketRequest extends WithRequest {
    _openWebSocket(
        url: string,
        options: ClientOptions | ClientRequestArgs
    ): Promise<WebSocket>
}

export abstract class HttpModelRequester<T extends ClientConfig = ClientConfig>
    extends ModelRequester<T>
    implements HttpRequest
{
    abstract requestService: Request
    abstract _logger?: Logger

    _post(
        url: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: any,
        params: RequestInit = {},
        headers: Record<string, string> = this._buildHeaders()
    ) {
        const requestUrl = this._concatUrl(url)

        for (const key in data) {
            if (data[key] === undefined) {
                delete data[key]
            }
        }

        const body = JSON.stringify(data)

        return this.requestService.fetch(requestUrl, {
            body,
            headers,
            method: 'POST',
            ...params
        })
    }

    _get(url: string, headers: Record<string, string> = this._buildHeaders()) {
        const requestUrl = this._concatUrl(url)

        return this.requestService.fetch(requestUrl, {
            method: 'GET',
            headers
        })
    }

    _buildHeaders() {
        return {
            'Content-Type': 'application/json'
        }
    }

    _concatUrl(url: string): string {
        return url
    }
}

export abstract class WebSocketModelRequester<
        T extends ClientConfig = ClientConfig
    >
    extends ModelRequester<T>
    implements WebSocketRequest
{
    abstract requestService: Request

    protected _ws: WebSocket

    async _openWebSocket(
        url: string,
        options: ClientOptions | ClientRequestArgs
    ): Promise<WebSocket> {
        // eslint-disable-next-line no-async-promise-executor
        this._ws = await new Promise(async (resolve, reject) => {
            const ws = await this.requestService.ws(url, options)

            ws.onopen = () => {
                resolve(ws)
            }

            ws.onerror = (err) => {
                reject(err)
            }
        })

        return this._ws
    }
}

export interface EmbeddingsRequester<T extends ClientConfig = ClientConfig> {
    embeddings(
        params: EmbeddingsRequestParams<T>
    ): Promise<number[] | number[][]>
}

function checkRange(times: number[], delayTime: number) {
    const first = times[0]
    const last = times[times.length - 1]

    return last - first < delayTime
}
