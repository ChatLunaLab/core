import {
    ChatLunaLLMChainWrapper,
    ChatLunaLLMChainWrapperInput,
    SystemPrompts
} from '@chatluna/core/src/chain'
import { PartialValues } from '@langchain/core/utils/types'
import {
    BaseChatPromptTemplate,
    BasePromptTemplate,
    HumanMessagePromptTemplate,
    MessagesPlaceholder
} from '@langchain/core/prompts'
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages'
import { ChatPromptValueInterface } from '@langchain/core/prompt_values'
import { Document } from '@langchain/core/documents'
import { messageTypeToOpenAIRole } from '@chatluna/core/src/utils'
import {
    BufferWindowMemory,
    VectorStoreRetrieverMemory
} from '@chatluna/core/src/memory'
import { ChatLunaChatModel } from '../model'

export class ChatLunaChatChain
    extends ChatLunaLLMChainWrapper
    implements ChatLunaLLMChainWrapperInput
{
    longMemory: VectorStoreRetrieverMemory

    chain: ChatHubLLMChain

    historyMemory: BufferWindowMemory

    systemPrompts?: SystemPrompts

    constructor(
        params: ChatLunaLLMChainWrapperInput & {
            chain: ChatHubLLMChain
        }
    ) {
        super(params)

        const { longMemory, historyMemory, systemPrompts, chain } = params

        this.botName = botName

        // roll back to the empty memory if not set
        this.longMemory = longMemory
        this.historyMemory = historyMemory
        this.systemPrompts =
            systemPrompts ??
            new SystemMessage(
                "You are ChatGPT, a large language model trained by OpenAI. Carefully heed the user's instructions."
            )
        this.chain = chain
    }

    static fromLLM(
        llm: ChatLunaChatModel,
        params: ChatLunaChatChain
    ): ChatLunaChatChain {
        const humanMessagePromptTemplate =
            HumanMessagePromptTemplate.fromTemplate(
                params.humanMessagePrompt ?? '{input}'
            )

        let conversationSummaryPrompt: HumanMessagePromptTemplate
        let messagesPlaceholder: MessagesPlaceholder

        const conversationSummaryPrompt = HumanMessagePromptTemplate.fromTemplate(
            // eslint-disable-next-line max-len
            `Relevant pieces of previous conversation: {long_history} (You do not need to use these pieces of information if not relevant, and based on these information, generate similar but non-repetitive responses. Pay attention, you need to think more and diverge your creativity.)`
        )

        messagesPlaceholder = new MessagesPlaceholder('chat_history')

        const prompt = new ChatHubChatPrompt({
            systemPrompts: systemPrompts ?? [
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

        const chain = new ChatHubLLMChain({ llm, prompt })

        return new ChatHubChatChain({
            botName,
            longMemory,
            historyMemory,
            systemPrompts,
            chain
        })
    }

    async call({
        message,
        stream,
        events,
        conversationId
    }: ChatHubLLMCallArg): Promise<ChainValues> {
        const requests: ChainValues = {
            input: message
        }
        const chatHistory =
            await this.historyMemory.loadMemoryVariables(requests)

        const longHistory = await this.longMemory.loadMemoryVariables({
            user: message.content
        })

        requests['chat_history'] = chatHistory[this.historyMemory.memoryKey]
        requests['long_history'] = longHistory[this.longMemory.memoryKey]
        requests['id'] = conversationId

        const response = await callChatHubChain(
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

        await this.longMemory.saveContext(
            { user: message.content },
            { your: responseString }
        )

        await this.historyMemory.chatHistory.addMessage(message)
        await this.historyMemory.chatHistory.addAIChatMessage(responseString)

        const vectorStore = this.longMemory.vectorStoreRetriever.vectorStore

        if (vectorStore instanceof ChatLunaSaveableVectorStore) {
            logger?.debug('saving vector store')
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
        return this.chain.llm
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

export class ChatLunaChatPrompt
    extends BaseChatPromptTemplate
    implements ChatLunaChatPromptInput
{
    systemPrompts?: SystemPrompts

    tokenCounter: (text: string) => Promise<number>

    messagesPlaceholder?: MessagesPlaceholder

    humanMessagePromptTemplate: HumanMessagePromptTemplate

    conversationSummaryPrompt: HumanMessagePromptTemplate

    sendTokenLimit?: number

    constructor(fields: ChatLunaChatPromptInput) {
        super({ inputVariables: ['chat_history', 'long_history', 'input'] })

        this.systemPrompts = fields.systemPrompts
        this.tokenCounter = fields.tokenCounter

        this.messagesPlaceholder = fields.messagesPlaceholder
        this.conversationSummaryPrompt = fields.conversationSummaryPrompt
        this.humanMessagePromptTemplate =
            fields.humanMessagePromptTemplate ??
            HumanMessagePromptTemplate.fromTemplate('{input}')
        this.sendTokenLimit = fields.sendTokenLimit ?? 4096
    }

    _getPromptType() {
        return 'chathub_chat' as const
    }

    private async _countMessageTokens(message: BaseMessage) {
        let result =
            (await this.tokenCounter(message.content as string)) +
            (await this.tokenCounter(
                messageTypeToOpenAIRole(message._getType())
            ))

        if (message.name) {
            result += await this.tokenCounter(message.name)
        }

        return result
    }

    async formatMessages({
        chat_history: chatHistory,
        long_history: longHistory,
        input
    }: {
        input: BaseMessage
        chat_history: BaseMessage[] | string
        long_history: Document[]
    }) {
        const result: BaseMessage[] = []
        let usedTokens = 0

        for (const message of this.systemPrompts || []) {
            const messageTokens = await this._countMessageTokens(message)

            // always add the system prompts
            result.push(message)
            usedTokens += messageTokens
        }

        const inputTokens = await this.tokenCounter(input.content as string)

        usedTokens += inputTokens

        let formatConversationSummary: HumanMessage | null

        const formatChatHistory: BaseMessage[] = []

        for (const message of (<BaseMessage[]>chatHistory).reverse()) {
            const messageTokens = await this._countMessageTokens(message)

            // reserve 400 tokens for the long history
            if (
                usedTokens + messageTokens >
                this.sendTokenLimit - (longHistory.length > 0 ? 480 : 80)
            ) {
                break
            }

            usedTokens += messageTokens
            formatChatHistory.unshift(message)
        }

        if (longHistory.length > 0) {
            const formatDocuments: Document[] = []

            for (const document of longHistory) {
                const documentTokens = await this.tokenCounter(
                    document.pageContent
                )

                // reserve 80 tokens for the format
                if (usedTokens + documentTokens > this.sendTokenLimit - 80) {
                    break
                }

                usedTokens += documentTokens
                formatDocuments.push(document)
            }

            formatConversationSummary =
                await this.conversationSummaryPrompt.format({
                    long_history: formatDocuments
                        .map((document) => document.pageContent)
                        .join(' ')
                })
        }

        const formatMessagesPlaceholder =
            await this.messagesPlaceholder.formatMessages({
                chat_history: formatChatHistory
            })

        result.push(...formatMessagesPlaceholder)

        if (formatConversationSummary) {
            result.push(formatConversationSummary)
            result.push(new AIMessage('Ok.'))
        }

        result.push(input)

        return result
    }

    partial(
        values: PartialValues
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<BasePromptTemplate<any, ChatPromptValueInterface, any>> {
        throw new Error('Method not implemented.')
    }
}
