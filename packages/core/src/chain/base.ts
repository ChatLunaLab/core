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

export async function callChatLunaChain(
    chain: ChatLunaLLMChain,
    values: ChainValues,
    events: ChainEvents
): Promise<BaseMessageChunk> {
    let usedToken = 0

    let response: BaseMessageChunk

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

    await events?.['llm-used-token-count'](usedToken)
    return response
}
