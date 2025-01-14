import {
    ChainEvents,
    ChatLunaLLMCallArg,
    ChatLunaLLMChain,
    ChatLunaLLMChainWrapperInput
} from '@chatluna/core/chain'
import { ChainValues } from '@langchain/core/utils/types'
import { BaseChatMemory } from '@chatluna/core/memory'
import { ChatLunaChatModel } from '@chatluna/core/model'
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

export abstract class ChatLunaLLMChainWrapper<
    T extends ChatLunaLLMChainWrapperInput = ChatLunaLLMChainWrapperInput,
    R extends ChatLunaLLMCallArg = ChatLunaLLMCallArg
> {
    protected constructor(_params: T) {}

    abstract call(arg: R): Promise<BaseMessageChunk>

    abstract historyMemory: BaseChatMemory

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

export async function callChatLunaChain(
    chain: ChatLunaLLMChain,
    values: ChainValues,
    events: ChainEvents
): Promise<BaseMessageChunk> {
    let usedToken = 0

    const options = {
        callbacks: [
            {
                /* c8 ignore next 3 */
                handleLLMNewToken(token: string) {
                    events?.['llm-new-token']?.(token)
                },
                handleLLMEnd(output) {
                    usedToken += output.llmOutput?.tokenUsage?.totalTokens
                }
            }
        ]
    }

    const getResponse = async () => {
        let response: BaseMessageChunk
        if (values.stream) {
            /* c8 ignore start */
            const streamIterable = await chain.stream(values, options)

            for await (const chunk of streamIterable) {
                if (response == null) {
                    response = chunk
                } else {
                    response = response.concat(chunk)
                }
            }

            /* c8 ignore end */
        } else {
            response = await chain.invoke(values, options)
        }

        return response
    }

    const response =
        values['signal'] instanceof AbortSignal
            ? ((await Promise.race([
                  getResponse(),
                  // eslint-disable-next-line promise/param-names
                  new Promise((_, reject) => {
                      values['signal'].addEventListener('abort', () => {
                          reject(new ChatLunaError(ChatLunaErrorCode.ABORTED))
                      })
                  })
              ])) as BaseMessageChunk)
            : await getResponse()

    await events?.['llm-used-token-count'](usedToken)
    return response
}
