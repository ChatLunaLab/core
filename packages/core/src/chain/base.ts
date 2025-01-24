import {
    ChainEvents,
    ChatLunaLLMCallArg,
    ChatLunaLLMChain,
    ChatLunaLLMChainWrapperInput
} from '@chatluna/core/chain'
import { ChainValues } from '@langchain/core/utils/types'
import {
    ChatLunaChatModel,
    ChatLunaModelCallOptions
} from '@chatluna/core/model'
import { BaseMessageChunk } from '@langchain/core/messages'
import {
    BaseLangChain,
    BaseLangChainParams
} from '@langchain/core/language_models/base'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import {
    CallbackManager,
    CallbackManagerForChainRun,
    Callbacks
} from '@langchain/core/callbacks/manager'
import { BaseMemory } from '@langchain/core/memory'
import { RUN_KEY } from '@langchain/core/outputs'
import { ensureConfig, RunnableConfig } from '@langchain/core/runnables'
import { BaseChatMessageHistory } from '@langchain/core/chat_history'
import { Context } from 'cordis'

export abstract class ChatLunaLLMChainWrapper<
    T extends ChatLunaLLMChainWrapperInput = ChatLunaLLMChainWrapperInput,
    R extends ChatLunaLLMCallArg = ChatLunaLLMCallArg
> {
    protected constructor(_params: T) {}

    abstract stream(arg: R): AsyncGenerator<BaseMessageChunk>

    async call(arg: R): Promise<BaseMessageChunk> {
        let lastMessage: BaseMessageChunk | undefined

        for await (const message of this.stream(arg)) {
            lastMessage =
                lastMessage != null ? lastMessage.concat(message) : message
        }

        return lastMessage
    }

    abstract historyMemory: BaseChatMessageHistory

    abstract get model(): ChatLunaChatModel

    abstract createChain(arg: Partial<ChatLunaLLMCallArg>): ChatLunaLLMChain
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadValues = Record<string, any>

export interface ChainInputs extends BaseLangChainParams {
    memory?: BaseMemory

    /**
     * @deprecated Use `callbacks` instead
     */
    callbackManager?: CallbackManager
}

/**
 * Base interface that all chains must implement.
 */
export abstract class BaseChain<
        RunInput extends ChainValues = ChainValues,
        RunOutput extends ChainValues = ChainValues
    >
    extends BaseLangChain<RunInput, RunOutput>
    implements ChainInputs
{
    declare memory?: BaseMemory

    get lc_namespace(): string[] {
        return ['langchain', 'chains', this._chainType()]
    }

    constructor(
        fields?: BaseMemory | ChainInputs,
        /** @deprecated */
        verbose?: boolean,
        /** @deprecated */
        callbacks?: Callbacks
    ) {
        if (
            arguments.length === 1 &&
            typeof fields === 'object' &&
            !('saveContext' in fields)
        ) {
            // fields is not a BaseMemory
            const { memory, callbackManager, ...rest } = fields
            super({ ...rest, callbacks: callbackManager ?? rest.callbacks })
            this.memory = memory
        } else {
            // fields is a BaseMemory
            super({ verbose, callbacks })
            this.memory = fields as BaseMemory
        }
    }

    /** @ignore */
    _selectMemoryInputs(values: ChainValues): ChainValues {
        const valuesForMemory = { ...values }
        if ('signal' in valuesForMemory) {
            delete valuesForMemory.signal
        }
        if ('timeout' in valuesForMemory) {
            delete valuesForMemory.timeout
        }
        return valuesForMemory
    }

    /**
     * Invoke the chain with the provided input and returns the output.
     * @param input Input values for the chain run.
     * @param config Optional configuration for the Runnable.
     * @returns Promise that resolves with the output of the chain run.
     */
    async invoke(
        input: RunInput,
        options?: RunnableConfig
    ): Promise<RunOutput> {
        const config = ensureConfig(options)
        const fullValues = await this._formatValues(input)
        const callbackManager_ = CallbackManager.configure(
            config?.callbacks,
            this.callbacks,
            config?.tags,
            this.tags,
            config?.metadata,
            this.metadata,
            { verbose: this.verbose }
        )
        const runManager = await callbackManager_?.handleChainStart(
            this.toJSON(),
            fullValues,
            undefined,
            undefined,
            undefined,
            undefined,
            config?.runName
        )
        let outputValues: RunOutput
        try {
            outputValues = await (fullValues.signal
                ? (Promise.race([
                      this._call(fullValues as RunInput, runManager, config),
                      // eslint-disable-next-line promise/param-names
                      new Promise((_, reject) => {
                          fullValues.signal?.addEventListener('abort', () => {
                              reject(
                                  new ChatLunaError(ChatLunaErrorCode.ABORTED)
                              )
                          })
                      })
                  ]) as Promise<RunOutput>)
                : this._call(fullValues as RunInput, runManager, config))
        } catch (e) {
            await runManager?.handleChainError(e)
            throw e
        }
        if (!(this.memory == null)) {
            await this.memory.saveContext(
                this._selectMemoryInputs(input),
                outputValues
            )
        }
        await runManager?.handleChainEnd(outputValues)
        // add the runManager's currentRunId to the outputValues
        Object.defineProperty(outputValues, RUN_KEY, {
            value: runManager ? { runId: runManager?.runId } : undefined,
            configurable: true
        })
        return outputValues
    }

    private _validateOutputs(outputs: Record<string, unknown>): void {
        const missingKeys = this.outputKeys.filter((k) => !(k in outputs))
        if (missingKeys.length) {
            throw new Error(
                `Missing output keys: ${missingKeys.join(
                    ', '
                )} from chain ${this._chainType()}`
            )
        }
    }

    async prepOutputs(
        inputs: Record<string, unknown>,
        outputs: Record<string, unknown>,
        returnOnlyOutputs = false
    ) {
        this._validateOutputs(outputs)
        if (this.memory) {
            await this.memory.saveContext(inputs, outputs)
        }
        if (returnOnlyOutputs) {
            return outputs
        }
        return { ...inputs, ...outputs }
    }

    /**
     * Run the core logic of this chain and return the output
     */
    abstract _call(
        values: RunInput,
        runManager?: CallbackManagerForChainRun,
        config?: RunnableConfig
    ): Promise<RunOutput>

    /**
     * Return the string type key uniquely identifying this class of chain.
     */
    abstract _chainType(): string

    /**
     * Return a json-like object representing this chain.
     */
    serialize(): unknown {
        throw new Error('Method not implemented.')
    }

    abstract get inputKeys(): string[]

    abstract get outputKeys(): string[]

    protected async _formatValues(
        values: ChainValues & { signal?: AbortSignal; timeout?: number }
    ) {
        const fullValues = { ...values } as typeof values
        if (fullValues.timeout && !fullValues.signal) {
            fullValues.signal = AbortSignal.timeout(fullValues.timeout)
            delete fullValues.timeout
        }
        if (!(this.memory == null)) {
            const newValues = await this.memory.loadMemoryVariables(
                this._selectMemoryInputs(values)
            )
            for (const [key, value] of Object.entries(newValues)) {
                fullValues[key] = value
            }
        }
        return fullValues
    }

    /**
     * Load a chain from a json-like object describing it.
     */
    static async deserialize(
        data: unknown,
        values: LoadValues = {}
    ): Promise<BaseChain> {
        throw new Error('Method not implemented.')
    }
}

// eslint-disable-next-line generator-star-spacing
export async function* streamCallChatLunaChain(
    chain: ChatLunaLLMChain,
    values: ChainValues & ChatLunaModelCallOptions,
    events: ChainEvents,
    params: ChainValues & { ctx?: Context }
) {
    let usedToken: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
    } = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
    }

    const options = {
        callbacks: [
            {
                /* c8 ignore next 3 */
                handleLLMNewToken(token: string) {
                    events?.['llm-new-token']?.(token)
                },
                handleLLMEnd(output) {
                    usedToken = output.llmOutput?.tokenUsage
                }
            }
        ]
    }

    const requestId = crypto.randomUUID()

    const signal = values.signal

    /* c8 ignore start */
    try {
        // eslint-disable-next-line no-async-promise-executor
        await (async () => {
            const conversationId = params.conversationId
            const platform = params.platform
            const ctx = params.ctx

            const modelQueue = ctx.chatluna_platform.modelQueue
            const conversationQueue = ctx.chatluna_platform.conversationQueue

            // Add to queues
            await Promise.all([
                conversationId
                    ? conversationQueue.add(conversationId, requestId)
                    : Promise.resolve(),
                modelQueue.add(platform, requestId)
            ])

            const currentQueueLength =
                await conversationQueue.getQueueLength(conversationId)
            await events?.['llm-queue-waiting'](currentQueueLength)
            console.log(params)

            // Wait for our turn
            await Promise.all([
                conversationId
                    ? conversationQueue.wait(conversationId, requestId, 0)
                    : Promise.resolve(),
                modelQueue.wait(platform, requestId, params.maxConcurrency ?? 3)
            ])
        })()

        const streamIterable = await chain.stream(values, {
            ...options
        })

        for await (const chunk of streamIterable) {
            if (signal && signal.aborted) {
                break
            }
            yield chunk
        }
    } finally {
        await (async () => {
            const conversationId = params.conversationId
            const platform = params.platform
            const ctx = params.ctx

            const modelQueue = ctx.chatluna_platform.modelQueue
            const conversationQueue = ctx.chatluna_platform.conversationQueue

            // Clean up resources

            // Wait for our turn
            await Promise.all([
                conversationId
                    ? conversationQueue.remove(conversationId, requestId)
                    : Promise.resolve(),
                modelQueue.remove(platform, requestId)
            ])
        })()
    }

    if (signal?.aborted ?? false) {
        throw new ChatLunaError(ChatLunaErrorCode.ABORTED)
    }

    await events?.['llm-used-token'](usedToken)
}
