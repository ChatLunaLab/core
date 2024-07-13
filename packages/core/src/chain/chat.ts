import {
    callChatLunaChain,
    ChatLunaChatPrompt,
    ChatLunaLLMCallArg,
    ChatLunaLLMChain,
    ChatLunaLLMChainWrapper,
    ChatLunaLLMChainWrapperInput,
    SystemPrompts
} from '@chatluna/core/chain'
import { BaseChatMemory } from '@chatluna/core/memory'
import { ChatLunaChatModel } from '@chatluna/core/model'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import { ChatLunaSaveableVectorStore } from '@chatluna/core/vectorstore'
import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages'
import {
    HumanMessagePromptTemplate,
    MessagesPlaceholder
} from '@langchain/core/prompts'
import { ChainValues } from '@langchain/core/utils/types'

export class ChatLunaChatChain
    extends ChatLunaLLMChainWrapper
    implements ChatLunaLLMChainWrapperInput
{
    historyMemory: BaseChatMemory

    prompt: ChatLunaChatPrompt

    private readonly _llm: ChatLunaChatModel

    constructor(
        params: ChatLunaLLMChainWrapperInput & {
            prompt: ChatLunaChatPrompt
            llm: ChatLunaChatModel
        }
    ) {
        super(params)

        const { historyMemory } = params

        this.historyMemory = historyMemory

        this.prompt = params.prompt
        this._llm = params.llm
    }

    static fromLLM(
        llm: ChatLunaChatModel,
        params: ChatLunaLLMChainWrapperInput
    ): ChatLunaChatChain {
        const humanMessagePromptTemplate = params.humanMessagePrompt

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

        return new ChatLunaChatChain({
            ...params,
            prompt,
            llm
        })
    }

    async call({
        message,
        stream,
        events,
        params,
        chatMemory,
        signal
    }: ChatLunaLLMCallArg): Promise<AIMessage> {
        const requests: ChainValues = {
            input: message
        }
        const chatHistory = (
            await this.historyMemory.loadMemoryVariables(requests)
        )?.[this.historyMemory.memoryKeys[0]] as BaseMessage[] | string | null

        const longHistory =
            chatMemory != null
                ? await chatMemory.loadMemoryVariables({
                      user: message.content
                  })
                : undefined

        this.prompt.systemPrompts =
            params?.systemPrompts ?? this.prompt.systemPrompts

        if (chatHistory == null || !(chatHistory instanceof Array)) {
            throw new ChatLunaError(
                ChatLunaErrorCode.UNKNOWN_ERROR,
                'The chat history is null or not an message array.'
            )
        }

        requests['chat_history'] = chatHistory

        requests['long_history'] = longHistory?.[chatMemory?.memoryKey]

        Object.assign(requests, params)

        const response = await callChatLunaChain(
            this.createChain({ signal }),
            {
                ...requests,
                stream
            },
            events
        )

        const responseString = response.content as string

        await chatMemory?.saveContext(
            { user: message.content },
            { your: responseString }
        )

        await this.historyMemory.chatHistory.addMessage(message)
        await this.historyMemory.chatHistory.addAIChatMessage(responseString)

        const vectorStore = chatMemory?.vectorStoreRetriever.vectorStore

        if (vectorStore instanceof ChatLunaSaveableVectorStore) {
            await vectorStore.save()
        }

        return new AIMessage(responseString)
    }

    createChain(arg: Partial<ChatLunaLLMCallArg>): ChatLunaLLMChain {
        return this.prompt.pipe(this._llm.bind({ signal: arg.signal }))
    }

    get model() {
        return this._llm
    }
}

export interface ChatLunaChatPromptInput {
    systemPrompts?: SystemPrompts
    messagesPlaceholder?: MessagesPlaceholder
    tokenCounter: (text: string) => Promise<number>
    conversationSummaryPrompt: HumanMessagePromptTemplate
    humanMessagePromptTemplate?: string
    sendTokenLimit?: number
}
