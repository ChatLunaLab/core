import {
    ChainEvents,
    ChatLunaLLMCallArg,
    ChatLunaLLMChain,
    ChatLunaLLMChainWrapperInput
} from '@chatluna/core/src/chain'
import { ChainValues } from '@langchain/core/utils/types'
import { BaseChatMemory } from '@chatluna/core/src/memory'
import { ChatLunaChatModel } from '@chatluna/core/src/model'
import { BaseMessageChunk } from '@langchain/core/messages'

export abstract class ChatLunaLLMChainWrapper<
    T extends ChatLunaLLMChainWrapperInput = ChatLunaLLMChainWrapperInput,
    R extends ChatLunaLLMCallArg = ChatLunaLLMCallArg
> {
    constructor(_params: T) {}

    abstract call(arg: R): Promise<ChainValues>

    abstract historyMemory: BaseChatMemory

    abstract get model(): ChatLunaChatModel
}

export async function callChatLunaChain(
    chain: ChatLunaLLMChain,
    values: ChainValues,
    events: ChainEvents
): Promise<ChainValues> {
    let usedToken = 0

    let response: BaseMessageChunk

    const callback = {
        callbacks: [
            {
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
        const streamIterable = await chain.stream(values, callback)

        for await (const chunk of streamIterable) {
            response = chunk
        }

        await events?.['llm-used-token-count'](usedToken)
    } else {
        response = await chain.invoke(values, callback)
    }

    await events?.['llm-used-token-count'](usedToken)
    return { text: response.content }
}
