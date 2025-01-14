import { ChatLunaLLMChainWrapper, ChatLunaLLMChainWrapperInput } from '@chatluna/core/chain'
import { BaseChatMemory } from '@chatluna/core/memory'
import { ChatLunaTool } from '@chatluna/core/platform'
import { PresetTemplate } from '@chatluna/core/preset'
import { BaseMessageChunk } from '@langchain/core/messages'
import { Context } from 'cordis'

export interface AssisantInput {
    ctx: Context
    chain: ChatLunaLLMChainWrapper
    preset: PresetTemplate
    memory: BaseChatMemory
    tools?: ChatLunaTool[]
}

export abstract class Assistant {
    constructor(input: AssisantInput) {}

    run(args: ChatLunaLLMChainWrapperInput): Promise<BaseMessageChunk> {
    }
}
