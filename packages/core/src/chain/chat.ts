import { ChainValues } from '@langchain/core/utils/types'
import {
    callChatLunaChain,
    ChatLunaChatPrompt,
    ChatLunaLLMCallArg,
    ChatLunaLLMChain,
    ChatLunaLLMChainWrapper,
    ChatLunaLLMChainWrapperInput
} from '@chatluna/core/chain'
import { PresetTemplate } from '@chatluna/core/preset'
import { BaseChatMemory } from '@chatluna/core/memory'
import { ChatLunaChatModel } from '@chatluna/core/model'
import { Context } from '@cordisjs/core'

export interface ChatLunaChatChainInput extends ChatLunaLLMChainWrapperInput {
    prompt: ChatLunaChatPrompt

    llm: ChatLunaChatModel
}

export class ChatLunaChatChain
    extends ChatLunaLLMChainWrapper
    implements ChatLunaChatChainInput
{
    botName: string

    llm: ChatLunaChatModel

    historyMemory: BaseChatMemory

    preset: () => Promise<PresetTemplate>

    prompt: ChatLunaChatPrompt

    ctx?: Context
    verbose?: boolean

    constructor(input: ChatLunaChatChainInput) {
        super(input)

        const { historyMemory, preset, llm, prompt } = input

        this.historyMemory = historyMemory
        this.preset = preset
        this.llm = llm
        this.prompt = prompt
    }

    static fromLLM(
        llm: ChatLunaChatModel,
        {
            historyMemory,
            preset,
            ctx
        }: Omit<ChatLunaChatChainInput, 'llm' | 'prompt'>
    ): ChatLunaLLMChainWrapper {
        const prompt = new ChatLunaChatPrompt({
            preset,
            tokenCounter: (text) => llm.getNumTokens(text),
            sendTokenLimit:
                llm.invocationParams().maxTokenLimit ??
                llm.getModelMaxContextSize(),
            logger: ctx?.logger('chatluna')
        })

        return new ChatLunaChatChain({
            llm,
            preset,
            prompt,
            historyMemory
        })
    }

    async call({
        message,
        stream,
        events,
        variables,
        signal
    }: ChatLunaLLMCallArg) {
        const requests: ChainValues = {
            input: message
        }
        const chatHistory =
            await this.historyMemory.loadMemoryVariables(requests)

        requests['chat_history'] = chatHistory[this.historyMemory.memoryKeys[0]]
        requests['variables'] = variables ?? {}

        const chain = this.createChain({ signal })
        const response = await callChatLunaChain(
            chain,
            {
                ...requests,
                stream,
                signal
            },
            events
        )

        return response
    }

    createChain(arg: Partial<ChatLunaLLMCallArg>): ChatLunaLLMChain {
        return this.prompt.pipe(this.llm.bind({ signal: arg.signal }))
    }

    get model() {
        return this.llm
    }
}
