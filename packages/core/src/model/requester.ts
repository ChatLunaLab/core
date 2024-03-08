import { Request, RequestInit } from '@chatluna/core/service'
import { BaseMessage } from '@langchain/core/messages'
import { ChatGeneration, ChatGenerationChunk } from '@langchain/core/outputs'
import { StructuredTool } from '@langchain/core/tools'
import { ClientRequestArgs } from 'http'
import { ClientOptions, WebSocket } from 'ws'

export interface BaseRequestParams {
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
}

export interface ModelRequestParams extends BaseRequestParams {
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

export interface EmbeddingsRequestParams extends BaseRequestParams {
    input: string | string[]
}

export interface BaseRequester extends WithRequester {
    init(): Promise<void>

    dispose(): Promise<void>
}

export interface WithRequester {
    requestService: Request
}

interface HttpRequest extends WithRequester {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _post(url: string, data: any, params: RequestInit): Promise<Response>

    _get(url: string): Promise<Response>

    _buildHeaders(): Record<string, string>

    _concatUrl(url: string): string
}

export interface WebSocketRequest extends WithRequester {
    _openWebSocket(
        url: string,
        options: ClientOptions | ClientRequestArgs
    ): Promise<WebSocket>
}

export abstract class ModelRequester implements BaseRequester {
    abstract requestService: Request

    async completion(params: ModelRequestParams): Promise<ChatGeneration> {
        const stream = this.completionStream(params)

        // get final result
        let result: ChatGeneration

        for await (const chunk of stream) {
            result = chunk
        }

        return result
    }

    abstract completionStream(
        params: ModelRequestParams
    ): AsyncGenerator<ChatGenerationChunk>

    async init(): Promise<void> {}

    async dispose(): Promise<void> {}
}

export abstract class HttpModelRequester
    extends ModelRequester
    implements HttpRequest
{
    abstract requestService: Request

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _post(url: string, data: any, params: RequestInit = {}) {
        const requestUrl = this._concatUrl(url)

        for (const key in data) {
            if (data[key] === undefined) {
                delete data[key]
            }
        }

        const body = JSON.stringify(data)

        // console.log('POST', requestUrl, body)

        return this.requestService.fetch(requestUrl, {
            body,
            headers: this._buildHeaders(),
            method: 'POST',
            ...params
        })
    }

    _get(url: string) {
        const requestUrl = this._concatUrl(url)

        return this.requestService.fetch(requestUrl, {
            method: 'GET',
            headers: this._buildHeaders()
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

export abstract class WebSocketModelRequester
    extends ModelRequester
    implements WebSocketRequest
{
    abstract requestService: Request

    protected _ws: WebSocket

    async _openWebSocket(
        url: string,
        options: ClientOptions | ClientRequestArgs
    ): Promise<WebSocket> {
        this._ws = await new Promise((resolve, reject) => {
            const ws = this.requestService.ws(url, options)

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

export interface EmbeddingsRequester {
    requestService: Request

    embeddings(params: EmbeddingsRequestParams): Promise<number[] | number[][]>
}
