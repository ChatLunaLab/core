import { Tiktoken } from 'js-tiktoken'
import {
    BaseChatModel,
    BaseChatModelCallOptions
} from '@langchain/core/language_models/chat_models'
import {
    EmbeddingsRequester,
    EmbeddingsRequestParams,
    ModelRequester,
    ModelRequestParams
} from '@chatluna/core/src/model'
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseMessage } from '@langchain/core/messages'
import {
    ChatGeneration,
    ChatGenerationChunk,
    ChatResult
} from '@langchain/core/outputs'
import { encodingForModel } from '../utils/tiktoken'
import {
    getModelContextSize,
    getModelNameForTiktoken,
    messageTypeToOpenAIRole
} from '../utils'
import { StructuredTool } from '@langchain/core/tools'
import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings'
import { chunkArray } from '../utils/chunk'
import { sleep } from 'koishi'
import {
    withResolver,
    ChatLunaError,
    ChatLunaErrorCode
} from '@chatluna/core/src/utils'
import { ModelInfo } from '@chatluna/core/src/platform'

export interface ChatLunaModelCallOptions extends BaseChatModelCallOptions {
    model?: string

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

    id?: string

    stream?: boolean

    tools?: StructuredTool[]

    tool_choice?: string | number
}

export interface ChatLunaModelInput extends ChatLunaModelCallOptions {
    llmType?: string

    modelMaxContextSize?: number

    modelInfo: ModelInfo

    requester: ModelRequester

    maxConcurrency?: number

    maxRetries?: number
}

export class ChatLunaChatModel extends BaseChatModel<ChatLunaModelCallOptions> {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    protected __encoding: Tiktoken

    private _requester: ModelRequester
    private _modelName: string
    private _maxModelContextSize: number
    private _modelInfo: ModelInfo

    // eslint-disable-next-line @typescript-eslint/naming-convention
    lc_serializable = false

    constructor(private _options: ChatLunaModelInput) {
        super(_options)
        this._requester = _options.requester
        this._modelName = _options.model
        this._maxModelContextSize = _options.modelMaxContextSize
        this._modelInfo = _options.modelInfo
    }

    get callKeys(): (keyof ChatLunaModelCallOptions)[] {
        return [
            ...(super.callKeys as (keyof ChatLunaModelCallOptions)[]),
            'model',
            'temperature',
            'maxTokens',
            'topP',
            'frequencyPenalty',
            'presencePenalty',
            'n',
            'logitBias',
            'id',
            'stream',
            'tools'
        ]
    }

    /**
     * Get the parameters used to invoke the model
     */
    invocationParams(
        options?: this['ParsedCallOptions']
    ): ChatLunaModelCallOptions {
        let maxTokens = options?.maxTokens ?? this._options.maxTokens

        if (maxTokens > this._maxModelContextSize || maxTokens < 0) {
            maxTokens = this._maxModelContextSize
        } else if (maxTokens === 0) {
            maxTokens = this._maxModelContextSize / 2
        }

        return {
            model: options?.model ?? this._options.model,
            temperature: options?.temperature ?? this._options.temperature,
            topP: options?.topP ?? this._options.topP,
            frequencyPenalty:
                options?.frequencyPenalty ?? this._options.frequencyPenalty,
            presencePenalty:
                options?.presencePenalty ?? this._options.presencePenalty,
            n: options?.n ?? this._options.n,
            logitBias: options?.logitBias ?? this._options.logitBias,
            maxTokens: maxTokens === -1 ? undefined : maxTokens,
            stop: options?.stop ?? this._options.stop,
            stream: options?.stream ?? this._options.stream,
            tools: options?.tools ?? this._options.tools,
            id: options?.id ?? this._options.id,
            timeout: options?.timeout ?? this._options.timeout
        }
    }

    async *_streamResponseChunks(
        messages: BaseMessage[],
        options: this['ParsedCallOptions'],
        runManager?: CallbackManagerForLLMRun
    ): AsyncGenerator<ChatGenerationChunk> {
        const stream = await this._createStreamWithRetry({
            ...options,
            input: messages
        })

        for await (const chunk of stream) {
            yield chunk
            if (chunk.message?.additional_kwargs?.function_call == null) {
                // eslint-disable-next-line no-void
                void runManager?.handleLLMNewToken(chunk.text ?? '')
            }
        }
    }

    async _generate(
        messages: BaseMessage[],
        options: this['ParsedCallOptions'],
        runManager?: CallbackManagerForLLMRun
    ): Promise<ChatResult> {
        // crop the messages according to the model's max context size
        let promptTokens: number
        ;[messages, promptTokens] = await this.cropMessages(
            messages,
            options['tools']
        )

        const params = this.invocationParams(options)

        // fallback to max
        if (
            params.maxTokens != null &&
            params.maxTokens >= getModelContextSize(params.model)
        ) {
            params.maxTokens = undefined
        }

        const response = await this._generateWithRetry(
            messages,
            params,
            runManager
        )

        if (response == null) {
            throw new ChatLunaError(ChatLunaErrorCode.API_REQUEST_FAILED)
        }

        response.generationInfo = response.generationInfo ?? {}

        if (response.generationInfo?.tokenUsage == null) {
            const completionTokens = await this._countMessageTokens(
                response.message
            )
            response.generationInfo.tokenUsage = {
                completionTokens,
                promptTokens,
                totalTokens: completionTokens + promptTokens
            }
        }

        return {
            generations: [response],
            llmOutput: response.generationInfo
        }
    }

    private _generateWithRetry(
        messages: BaseMessage[],
        options: ChatLunaModelCallOptions,
        runManager?: CallbackManagerForLLMRun
    ): Promise<ChatGeneration> {
        const generateWithRetry = async () => {
            let response: ChatGeneration

            if (options.stream) {
                const stream = this._streamResponseChunks(
                    messages,
                    options,
                    runManager
                )
                for await (const chunk of stream) {
                    response = chunk
                }
            } else {
                response = await this._completionWithRetry({
                    ...options,
                    input: messages
                })
            }

            return response
        }

        return this.caller.call(generateWithRetry)
    }

    private async _withTimeout<T>(
        func: () => Promise<T>,
        timeout: number
    ): Promise<T> {
        const { promise, resolve, reject } = withResolver<T>()

        const timeoutId = setTimeout(() => {
            reject(new ChatLunaError(ChatLunaErrorCode.API_REQUEST_TIMEOUT))
        }, timeout)

        ;(async () => {
            let result: T

            try {
                result = await func()
                clearTimeout(timeoutId)
            } catch (error) {
                clearTimeout(timeoutId)
                reject(error)
                return
            }

            clearTimeout(timeoutId)

            resolve(result)
        })()

        return promise
    }

    /**
     ** Creates a streaming request with retry.
     * @param request The parameters for creating a completion.
     ** @returns A streaming request.
     */
    private _createStreamWithRetry(params: ModelRequestParams) {
        const makeCompletionRequest = async () => {
            try {
                const result = await this._withTimeout(
                    async () => this._requester.completionStream(params),
                    params.timeout
                )
                return result
            } catch (e) {
                await sleep(2000)
                throw e
            }
        }
        return this.caller.call(makeCompletionRequest)
    }

    /** @ignore */
    private _completionWithRetry(params: ModelRequestParams) {
        const makeCompletionRequest = async () => {
            const result = await this._withTimeout(
                async () => await this._requester.completion(params),
                params.timeout
            )
            return result
        }
        return this.caller.call(makeCompletionRequest)
    }

    async cropMessages(
        messages: BaseMessage[],
        tools?: StructuredTool[],
        systemMessageLength: number = 1
    ): Promise<[BaseMessage[], number]> {
        messages = messages.concat()
        const result: BaseMessage[] = []

        let totalTokens = 0

        /* ??
        // If there are functions, add the function definitions as they count towards token usage
        if (tools && tool_call !== 'auto') {
            const promptDefinitions = formatFunctionDefinitions(formattedTools)
            totalTokens += await this.getNumTokens(promptDefinitions)
            totalTokens += 9 // Add nine per completion
        } */

        // If there's a system message _and_ functions are present, subtract four tokens. I assume this is because
        // functions typically add a system message, but reuse the first one if it's already there. This offsets
        // the extra 9 tokens added by the function definitions.
        if (tools && messages.find((m) => m._getType() === 'system')) {
            totalTokens -= 4
        }

        // always add the first message
        const systemMessages: BaseMessage[] = []

        let index = 0

        if (messages.length < systemMessageLength) {
            throw new ChatLunaError(
                ChatLunaErrorCode.UNKNOWN_ERROR,
                new Error('Message length is less than system message length')
            )
        }

        while (index < systemMessageLength) {
            const message = messages.shift()
            systemMessages.push(message)
            totalTokens += await this._countMessageTokens(message)
            index++
        }

        for (const message of messages.reverse()) {
            const messageTokens = await this._countMessageTokens(message)

            if (totalTokens + messageTokens > this.getModelMaxContextSize()) {
                break
            }

            totalTokens += messageTokens
            result.unshift(message)
        }

        for (const message of systemMessages.reverse()) {
            result.unshift(message)
        }

        return [result, totalTokens]
    }

    private async _countMessageTokens(message: BaseMessage) {
        let totalCount = 0
        let tokensPerMessage = 0
        let tokensPerName = 0

        // From: https://github.com/openai/openai-cookbook/blob/main/examples/How_to_format_inputs_to_ChatGPT_models.ipynb
        if (this.modelName === 'gpt-3.5-turbo-0301') {
            tokensPerMessage = 4
            tokensPerName = -1
        } else {
            tokensPerMessage = 3
            tokensPerName = 1
        }

        const textCount = await this.getNumTokens(message.content as string)
        const roleCount = await this.getNumTokens(
            messageTypeToOpenAIRole(message._getType())
        )
        const nameCount =
            message.name !== undefined
                ? tokensPerName + (await this.getNumTokens(message.name))
                : 0
        let count = textCount + tokensPerMessage + roleCount + nameCount

        // From: https://github.com/hmarr/openai-chat-tokens/blob/main/src/index.ts messageTokenEstimate
        const openAIMessage = message
        if (openAIMessage._getType() === 'function') {
            count -= 2
        }
        if (openAIMessage.additional_kwargs?.function_call) {
            count += 3
        }
        if (openAIMessage?.additional_kwargs.function_call?.name) {
            count += await this.getNumTokens(
                openAIMessage.additional_kwargs.function_call?.name
            )
        }
        if (
            openAIMessage.additional_kwargs.function_call?.arguments &&
            typeof openAIMessage.additional_kwargs.function_call.arguments ===
                'string'
        ) {
            count += await this.getNumTokens(
                // Remove newlines and spaces
                JSON.stringify(
                    JSON.parse(
                        openAIMessage.additional_kwargs.function_call?.arguments
                    )
                )
            )
        }

        totalCount += count

        totalCount += 3 // every reply is primed with <|start|>assistant<|message|>

        return totalCount
    }

    async clearContext(): Promise<void> {
        await this._requester.dispose()
    }

    getModelMaxContextSize() {
        if (this._maxModelContextSize != null) {
            return this._maxModelContextSize
        }
        const modelName = this._modelName ?? 'gpt2'
        return getModelContextSize(modelName)
    }

    async getNumTokens(text: string) {
        // fallback to approximate calculation if tiktoken is not available
        let numTokens = Math.ceil(text.length / 4)

        if (!this.__encoding) {
            try {
                this.__encoding = await encodingForModel(
                    'modelName' in this
                        ? getModelNameForTiktoken(this.modelName as string)
                        : 'gpt2'
                )
            } catch (error) {
                /* logger.warn(
                    'Failed to calculate number of tokens, falling back to approximate count',
                    error
                ) */
            }
        }

        if (this.__encoding) {
            numTokens = this.__encoding.encode(text).length
        }
        return numTokens
    }

    _llmType(): string {
        return this._options?.llmType ?? 'openai'
    }

    get modelName() {
        return this._modelName
    }

    get modelInfo() {
        return this._modelInfo
    }

    _modelType(): string {
        return 'base_chat_model'
    }

    /** @ignore */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _combineLLMOutput(...llmOutputs: any[]): any {}
}

export interface ChatLunaBaseEmbeddingsParams extends EmbeddingsParams {
    /**
     * Timeout to use when making requests.
     */
    timeout?: number

    /**
     * The maximum number of documents to embed in a single request. This is
     * limited by the OpenAI API to a maximum of 2048.
     */
    batchSize?: number

    /**
     * Whether to strip new lines from the input text. This is recommended by
     * OpenAI, but may not be suitable for all use cases.
     */
    stripNewLines?: boolean

    maxRetries?: number

    client: EmbeddingsRequester

    model?: string
}

export abstract class ChatHubBaseEmbeddings extends Embeddings {}

export class ChatLunaEmbeddings extends ChatHubBaseEmbeddings {
    modelName = 'text-embedding-ada-002'

    batchSize = 256

    stripNewLines = true

    timeout?: number

    private _client: EmbeddingsRequester

    constructor(fields?: ChatLunaBaseEmbeddingsParams) {
        super(fields)

        this.batchSize = fields?.batchSize ?? this.batchSize
        this.stripNewLines = fields?.stripNewLines ?? this.stripNewLines
        this.timeout = fields?.timeout ?? 1000 * 60
        this.modelName = fields?.model ?? this.modelName

        this._client = fields?.client
    }

    async embedDocuments(texts: string[]): Promise<number[][]> {
        const subPrompts = chunkArray(
            this.stripNewLines
                ? texts.map((t) => t.replaceAll('\n', ' '))
                : texts,
            this.batchSize
        )

        const embeddings: number[][] = []

        for (let i = 0; i < subPrompts.length; i += 1) {
            const input = subPrompts[i]
            const data = await this._embeddingWithRetry({
                model: this.modelName,
                input
            })
            for (let j = 0; j < input.length; j += 1) {
                embeddings.push(data[j] as number[])
            }
        }

        return embeddings
    }

    async embedQuery(text: string): Promise<number[]> {
        const data = await this._embeddingWithRetry({
            model: this.modelName,
            input: this.stripNewLines ? text.replaceAll('\n', ' ') : text
        })
        if (data[0] instanceof Array) {
            return data[0]
        }
        return data as number[]
    }

    private _embeddingWithRetry(request: EmbeddingsRequestParams) {
        request.timeout = request.timeout ?? this.timeout
        return this.caller.call(async (request: EmbeddingsRequestParams) => {
            const { promise, resolve, reject } = withResolver<
                number[] | number[][]
            >()

            const timeout = setTimeout(
                () => {
                    reject(
                        Error(
                            `timeout when calling ${this.modelName} embeddings`
                        )
                    )
                },
                this.timeout ?? 1000 * 30
            )

            ;(async () => {
                let data: number[] | number[][]

                try {
                    data = await this._client.embeddings(request)
                } catch (e) {
                    if (e instanceof ChatLunaError) {
                        reject(e)
                    } else {
                        reject(
                            new ChatLunaError(
                                ChatLunaErrorCode.API_REQUEST_FAILED,
                                e
                            )
                        )
                    }
                }

                clearTimeout(timeout)

                if (data) {
                    resolve(data)
                    return
                }

                reject(
                    Error(
                        `error when calling ${this.modelName} embeddings, Result: ` +
                            JSON.stringify(data)
                    )
                )
            })()

            return promise
        }, request)
    }
}
