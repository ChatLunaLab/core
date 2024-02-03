import {
    callChatLunaChain,
    ChatLunaChatPrompt,
    ChatLunaLLMCallArg,
    ChatLunaLLMChain,
    ChatLunaLLMChainWrapper,
    ChatLunaLLMChainWrapperInput,
    SystemPrompts
} from '@chatluna/core/src/chain'
import { ChainValues } from '@langchain/core/utils/types'
import {
    HumanMessagePromptTemplate,
    MessagesPlaceholder
} from '@langchain/core/prompts'
import { AIMessage, SystemMessage } from '@langchain/core/messages'
import {
    BufferWindowMemory,
    VectorStoreRetrieverMemory
} from '@chatluna/core/src/memory'
import { ChatLunaChatModel } from '@chatluna/core/src/model'
import { ChatLunaSaveableVectorStore } from '@chatluna/core/src/vectorstore'

export class ChatLunaChatChain
    extends ChatLunaLLMChainWrapper
    implements ChatLunaLLMChainWrapperInput
{
    chatMemory: VectorStoreRetrieverMemory

    chain: ChatLunaLLMChain

    historyMemory: BufferWindowMemory

    prompt: ChatLunaChatPrompt

    llm: ChatLunaChatModel

    constructor(
        params: ChatLunaLLMChainWrapperInput & {
            chain: ChatLunaLLMChain
            prompt: ChatLunaChatPrompt
            llm: ChatLunaChatModel
        }
    ) {
        super(params)

        const { chatMemory: longMemory, historyMemory, chain } = params

        this.chatMemory = longMemory
        this.historyMemory = historyMemory

        this.chain = chain
        this.prompt = params.prompt
        this.llm = params.llm
    }

    static fromLLM(
        llm: ChatLunaChatModel,
        params: ChatLunaLLMChainWrapperInput
    ): ChatLunaChatChain {
        const humanMessagePromptTemplate =
            HumanMessagePromptTemplate.fromTemplate(
                params.humanMessagePrompt ?? '{input}'
            )

        const conversationSummaryPrompt =
            HumanMessagePromptTemplate.fromTemplate(
                // eslint-disable-next-line max-len
                `Relevant pieces of previous conversation: {long_history} (You do not need to use these pieces of information if not relevant, and based on these information, generate similar but non-repetitive responses. Pay attention, you need to think more and diverge your creativity.)`
            )

        const messagesPlaceholder = new MessagesPlaceholder('chat_history')

        const prompt = new ChatLunaChatPrompt({
            systemPrompts: params.systemPrompts ?? [
                new SystemMessage(
                    "You are ChatGPT, a large language model trained by OpenAI. Carefully heed the user's instructions."
                )
            ],
            conversationSummaryPrompt,
            messagesPlaceholder,
            tokenCounter: (text) => llm.getNumTokens(text),
            humanMessagePromptTemplate,
            sendTokenLimit:
                llm.invocationParams().maxTokens ?? llm.getModelMaxContextSize()
        })

        const chain = prompt.pipe(llm)

        return new ChatLunaChatChain({
            ...params,
            chain,
            prompt,
            llm
        })
    }

    async call({
        message,
        stream,
        events,
        params
    }: ChatLunaLLMCallArg): Promise<ChainValues> {
        const requests: ChainValues = {
            input: message
        }
        const chatHistory =
            await this.historyMemory.loadMemoryVariables(requests)

        const longHistory =
            this.chatMemory != null
                ? await this.chatMemory.loadMemoryVariables({
                      user: message.content
                  })
                : undefined

        this.prompt.systemPrompts =
            params?.systemPrompts ?? this.prompt.systemPrompts

        requests['chat_history'] = chatHistory[this.historyMemory.memoryKey]
        requests['long_history'] = longHistory[this.chatMemory.memoryKey]

        Object.assign(requests, params)

        const response = await callChatLunaChain(
            this.chain,
            {
                ...requests,
                stream
            },
            events
        )

        if (response.text == null) {
            throw new Error('response.text is null')
        }

        const responseString = response.text

        await this.chatMemory.saveContext(
            { user: message.content },
            { your: responseString }
        )

        await this.historyMemory.chatHistory.addMessage(message)
        await this.historyMemory.chatHistory.addAIChatMessage(responseString)

        const vectorStore = this.chatMemory.vectorStoreRetriever.vectorStore

        if (vectorStore instanceof ChatLunaSaveableVectorStore) {
            await vectorStore.save()
        }

        const aiMessage = new AIMessage(responseString)
        response.message = aiMessage

        if (
            response.extra != null &&
            'additionalReplyMessages' in response.extra
        ) {
            response.additionalReplyMessages =
                response.extra.additionalReplyMessages
        }

        return response
    }

    get model() {
        return this.llm
    }
}

export interface ChatLunaChatPromptInput {
    systemPrompts?: SystemPrompts
    messagesPlaceholder?: MessagesPlaceholder
    tokenCounter: (text: string) => Promise<number>
    conversationSummaryPrompt: HumanMessagePromptTemplate
    humanMessagePromptTemplate?: HumanMessagePromptTemplate
    sendTokenLimit?: number
}
