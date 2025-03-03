import { ChainValues } from '@langchain/core/utils/types'
import { PresetTemplate } from '@chatluna/core/preset'
import { Context } from 'cordis'
import {
    BaseChatMessageHistory,
    bindPromptTemplate,
    LanguageModel,
    streamText
} from 'cortexluna'
import { calculateTokens, getModelNameForTiktoken } from '@chatluna/core/utils'
import { ChatLunaChatPrompt } from './prompt.ts'
import { ChatLunaLLMCallArg, ChatLunaLLMChainWrapperInput } from './types.ts'
import { ChatLunaLLMChainWrapper, streamCallChatLunaChain } from './base.ts'

export interface ChatLunaChatChainInput extends ChatLunaLLMChainWrapperInput {
    prompt: ChatLunaChatPrompt

    llm: LanguageModel
}

export class ChatLunaChatChain
    extends ChatLunaLLMChainWrapper
    implements ChatLunaChatChainInput
{
    botName: string

    llm: LanguageModel

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
        this.ctx = input.ctx
    }

    static fromLLM(
        llm: LanguageModel,
        {
            historyMemory,
            preset,
            ctx
        }: Omit<ChatLunaChatChainInput, 'llm' | 'prompt'>
    ): ChatLunaLLMChainWrapper {
        const prompt = new ChatLunaChatPrompt({
            preset,
            tokenCounter: (text) =>
                calculateTokens({
                    prompt: text,
                    modelName: getModelNameForTiktoken(llm.model)
                }),
            sendTokenLimit: 120000,
            logger: ctx?.logger('chatluna')
        })

        return new ChatLunaChatChain({
            llm,
            preset,
            prompt,
            ctx,
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

        const chain = this.createChain()

        for await (const chunk of streamCallChatLunaChain(
            chain,
            {
                ...requests,
                signal
            },
            events,
            {
                ...params,
                ctx: this.ctx,
                platform: this.llm.provider
            }
        )) {
            yield chunk
        }
    }

    createChain() {
        return {
            chain: bindPromptTemplate(this.prompt, streamText),
            model: this.llm
        }
    }

    get model() {
        return this.llm
    }
}
