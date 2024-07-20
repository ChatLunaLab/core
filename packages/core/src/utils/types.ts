export type PromiseLikeDisposable = () => PromiseLike<void> | void

export interface OpenAIResponse {
    choices: {
        index: number
        finish_reason: string | null
        delta: {
            content?: string
            role?: string
            function_call?: OpenAIToolCall
        }
        message: OpenAIResponseMessage
    }[]
    id: string
    object: string
    created: number
    model: string
    usage: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

export interface OpenAIResponseMessage {
    role: string
    content?:
        | string
        | (
              | {
                    type: 'text'
                    text: string
                }
              | {
                    type: 'image_url'
                    image_url: {
                        url: string
                        detail?: 'low' | 'high'
                    }
                }
          )[]

    name?: string
    tool_calls?: OpenAIToolCall[]
    tool_call_id?: string
}

export interface OpenAIFunction {
    name: string
    description?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters?: { [key: string]: any }
}

export interface OpenAITool {
    type: string
    function: OpenAIFunction
}

export interface OpenAIToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

export interface OpenAICreateEmbeddingResponse {
    object: string

    model: string

    data: OpenAICreateEmbeddingResponseDataInner[]

    usage: CreateEmbeddingResponseUsage
}

export interface OpenAICreateEmbeddingRequest {
    model: string
    input: string | string[]
}

/**
 *
 * @export
 * @interface CreateEmbeddingResponseDataInner
 */
export interface OpenAICreateEmbeddingResponseDataInner {
    /**
     *
     * @type {number}
     * @memberof CreateEmbeddingResponseDataInner
     */
    index: number
    /**
     *
     * @type {string}
     * @memberof CreateEmbeddingResponseDataInner
     */
    object: string
    /**
     *
     * @type {Array<number>}
     * @memberof CreateEmbeddingResponseDataInner
     */
    embedding: number[]
}
/**
 *
 * @export
 * @interface CreateEmbeddingResponseUsage
 */
export interface CreateEmbeddingResponseUsage {
    /**
     *
     * @type {number}
     * @memberof CreateEmbeddingResponseUsage
     */
    prompt_tokens: number
    /**
     *
     * @type {number}
     * @memberof CreateEmbeddingResponseUsage
     */
    total_tokens: number
}

export type OpenAIMessageRole =
    | 'system'
    | 'assistant'
    | 'user'
    | 'function'
    | 'tool'
