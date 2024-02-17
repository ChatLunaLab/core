import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages'
import { ChatPromptValueInterface } from '@langchain/core/prompt_values'
import {
    BaseChatPromptTemplate,
    BasePromptTemplate,
    HumanMessagePromptTemplate,
    MessagesPlaceholder
} from '@langchain/core/prompts'
import { Document } from '@langchain/core/documents'
import { PartialValues } from '@langchain/core/utils/types'
import { messageTypeToOpenAIRole } from '@chatluna/core/utils'
import { ChatLunaChatPromptInput, SystemPrompts } from '@chatluna/core/chain'

export class ChatLunaChatPrompt extends BaseChatPromptTemplate {
    /*  implements ChatLunaChatPromptInput */
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
            HumanMessagePromptTemplate.fromTemplate(
                fields.humanMessagePromptTemplate ?? '{input}'
            )
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
                this.sendTokenLimit - (longHistory?.length > 0 ? 480 : 80)
            ) {
                /* c8 ignore next */ break
            }

            usedTokens += messageTokens
            formatChatHistory.unshift(message)
        }

        if (longHistory?.length > 0) {
            const formatDocuments: Document[] = []

            for (const document of longHistory) {
                const documentTokens = await this.tokenCounter(
                    document.pageContent
                )

                // reserve 80 tokens for the format
                if (usedTokens + documentTokens > this.sendTokenLimit - 80) {
                    /* c8 ignore next */ break
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

    /* c8 ignore start */
    partial(
        _values: PartialValues
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<BasePromptTemplate<any, ChatPromptValueInterface, any>> {
        throw new Error('Method not implemented.')
    }
    /* c8 ignore stop */
}
