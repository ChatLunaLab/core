import {
    ChainEvents,
    ChatLunaLLMCallArg,
    ChatLunaLLMChainWrapperInput
} from '@chatluna/core/chain'
import { ChainValues } from '@langchain/core/utils/types'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import { Context } from 'cordis'
import {
    BaseChatMessageHistory,
    BaseMessageChunk,
    bindPromptTemplate,
    Callback,
    concatChunks,
    LanguageModel,
    LanguageModelCallOptions,
    streamText
} from 'cortexluna'

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
                lastMessage != null
                    ? concatChunks(lastMessage, message)
                    : message
        }

        return lastMessage
    }

    abstract historyMemory: BaseChatMessageHistory

    abstract get model(): LanguageModel

    abstract createChain(arg: Partial<ChatLunaLLMCallArg>): ChatLunaLLMChain
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadValues = Record<string, any>
export type ChatLunaLLMChain = {
    chain: ReturnType<typeof bindPromptTemplate<typeof streamText>>
    model: LanguageModel
}

// eslint-disable-next-line generator-star-spacing
export async function* streamCallChatLunaChain(
    chain: ChatLunaLLMChain,
    values: ChainValues &
        Omit<LanguageModelCallOptions, 'model' | 'tools' | 'prompt'>,
    events: ChainEvents,
    params: ChainValues & { ctx?: Context }
) {
    const usedToken: {
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
                /* handleLLMNewToken(token: string) {
                    events?.['llm-new-token']?.(token)
                }, */
                onLLMEnd(meta?: Record<string, unknown>) {
                    const usage = meta.usage as {
                        promptTokens: number
                        completionTokens: number
                        totalTokens: number
                    }

                    usedToken.promptTokens =
                        usedToken.promptTokens + usage.promptTokens
                    usedToken.completionTokens =
                        usedToken.completionTokens + usage.completionTokens
                    usedToken.totalTokens =
                        usedToken.totalTokens + usage.totalTokens
                }
            } satisfies Callback
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

        const streamIterable = chain.chain({
            model: chain.model,
            input: values,
            ...values,
            ...options
        })

        for await (const chunk of (await streamIterable).messageStream) {
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
