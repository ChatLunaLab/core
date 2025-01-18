import { ChainValues } from '@langchain/core/utils/types'
import {
    ChatLunaChatPrompt,
    ChatLunaLLMCallArg,
    ChatLunaLLMChain,
    ChatLunaLLMChainWrapper,
    ChatLunaLLMChainWrapperInput,
    streamCallChatLunaChain
} from '@chatluna/core/chain'
import { PresetTemplate } from '@chatluna/core/preset'
import { ChatLunaChatModel } from '@chatluna/core/model'
import { Context } from 'cordis'
import { BaseChatMessageHistory } from '@langchain/core/chat_history'

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

    historyMemory: BaseChatMessageHistory

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

    async *stream({
        message,
        stream,
        events,
        variables,
        signal,
        params
    }: ChatLunaLLMCallArg) {
        const requests: ChainValues = {
            input: message
        }

        requests['chat_history'] = await this.historyMemory.getMessages()
        requests['variables'] = variables ?? {}

        const chain = this.createChain({ signal })

        for await (const chunk of streamCallChatLunaChain(
            chain,
            {
                ...requests,
                stream,
                signal
            },
            events,
            {
                ...params,
                ctx: this.ctx,
                platform: this.llm._llmType(),
                ...this.llm.invocationParams()
            }
        )) {
            yield chunk
        }
    }

    createChain(arg: Partial<ChatLunaLLMCallArg>): ChatLunaLLMChain {
        return this.prompt.pipe(this.llm.bind({ signal: arg.signal }))
    }

    get model() {
        return this.llm
    }
}
