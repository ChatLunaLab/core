import { ChatLunaLLMCallArg } from '@chatluna/core/src/chain'
import { ChainValues } from '@langchain/core/utils/types'
import { BufferWindowMemory } from '@chatluna/core/src/memory'
import { ChatLunaChatModel } from '@chatluna/core/src/model'

export abstract class ChatLunaLLMChainWrapper<
    T extends ChatLunaLLMCallArg = ChatLunaLLMCallArg
> {
    abstract call(arg: T): Promise<ChainValues>

    abstract historyMemory: BufferWindowMemory

    abstract get model(): ChatLunaChatModel
}
