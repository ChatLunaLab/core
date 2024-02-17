import {
    ChainEvents,
    ChatLunaLLMCallArg,
    ChatLunaLLMChain,
    ChatLunaLLMChainWrapperInput
} from '@chatluna/core/chain'
import { ChainValues } from '@langchain/core/utils/types'
import { BaseChatMemory } from '@chatluna/core/memory'
import { ChatLunaChatModel } from '@chatluna/core/model'
import { AIMessage, BaseMessageChunk } from '@langchain/core/messages'

export abstract class ChatLunaLLMChainWrapper<
    T extends ChatLunaLLMChainWrapperInput = ChatLunaLLMChainWrapperInput,
    R extends ChatLunaLLMCallArg = ChatLunaLLMCallArg
> {
    constructor(_params: T) {}

    abstract call(arg: R): Promise<AIMessage>

    abstract historyMemory: BaseChatMemory

    abstract get model(): ChatLunaChatModel
}

export async function callChatLunaChain(
    chain: ChatLunaLLMChain,
    values: ChainValues,
    events: ChainEvents
): Promise<BaseMessageChunk> {
    let usedToken = 0

    let response: BaseMessageChunk

    const callback = {
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

    if (values.stream) {
        /* c8 ignore start */
        const streamIterable = await chain.stream(values, callback)

        for await (const chunk of streamIterable) {
            response = chunk
        }

        await events?.['llm-used-token-count'](usedToken)
        /* c8 ignore end */
    } else {
        response = await chain.invoke(values, callback)
    }

    await events?.['llm-used-token-count'](usedToken)
    return response
}
