/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
import { Document } from '@langchain/core/documents'
import { Logger } from 'cordis'
import {
    AuthorsNote,
    formatMessages,
    formatPresetTemplate,
    formatPresetTemplateString,
    PresetTemplate,
    RoleBook
} from '@chatluna/core/preset'
import { SystemPrompts } from '@chatluna/core/chain'
import {
    BaseMessage,
    BaseMessagePromptTemplate,
    BaseMessagesPromptTemplate,
    BasePromptTemplate,
    InputValues,
    messagePromptTemplate,
    PartialValues,
    UserMessage
} from 'cortexluna'

export interface ChatLunaChatPromptInput {
    messagesPlaceholder?: BaseMessagesPromptTemplate
    tokenCounter: (text: string) => Promise<number>
    sendTokenLimit?: number
    preset?: () => Promise<PresetTemplate>
    logger?: Logger
}

export class ChatLunaChatPrompt implements BaseMessagesPromptTemplate {
    getPreset?: () => Promise<PresetTemplate>

    tokenCounter: (text: string) => Promise<number>

    conversationSummaryPrompt?: BaseMessagePromptTemplate<UserMessage>

    knowledgePrompt?: BaseMessagePromptTemplate<UserMessage>

    _tempPreset?: [PresetTemplate, [SystemPrompts, string[]]]

    sendTokenLimit?: number

    logger?: Logger

    private _systemPrompts: BaseMessage[]

    partialValues?: PartialValues

    constructor(fields: ChatLunaChatPromptInput) {
        //  super({ inputVariables: ['chat_history', 'variables', 'input'] })

        this.tokenCounter = fields.tokenCounter

        this.sendTokenLimit = fields.sendTokenLimit ?? 4096
        this.getPreset =
            fields.preset ??
            (async () => {
                return {
                    triggerKeyword: [''],
                    rawText: '',
                    messages: [],
                    config: {}
                } satisfies PresetTemplate
            })
    }

    _type = 'base_messages_prompt_template' as const

    inputVariables: string[] = ['chat_history', 'variables', 'input']
    template: string = ''

    format(values: InputValues): Promise<BaseMessage[]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.formatMessages(values as any)
    }

    messagesPlaceholder?: BaseMessagesPromptTemplate<BaseMessage[]>
    preset?: () => Promise<PresetTemplate>

    _getPromptType() {
        return 'chatluna_chat' as const
    }

    private async _countMessageTokens(message: BaseMessage) {
        let result =
            (await this.tokenCounter(message.content as string)) +
            (await this.tokenCounter(message.role))

        if (message.name) {
            result += await this.tokenCounter(message.name)
        }

        return result
    }

    private async _formatSystemPrompts(variables: InputValues) {
        const preset = await this.getPreset()

        if (!this._tempPreset || this._tempPreset[0] !== preset) {
            this.conversationSummaryPrompt = messagePromptTemplate(
                'user',
                preset.config.longMemoryPrompt ?? // eslint-disable-next-line max-len
                    `Relevant context: {long_history}

Guidelines for response:
1. Use the system prompt as your primary guide.
2. Incorporate the provided context if relevant, but don't force its inclusion.
3. Generate thoughtful, creative, and diverse responses.
4. Avoid repetition and expand your perspective.

Your goal is to craft an insightful, engaging response that seamlessly integrates all relevant information while maintaining coherence and originality.`
            )

            this.knowledgePrompt = messagePromptTemplate(
                'user',
                preset.knowledge?.prompt ??
                    `Relevant knowledge: {input}

Guidelines for incorporating knowledge:
1. Review the provided knowledge and assess its relevance to the current conversation.
2. If relevant, seamlessly integrate this information into your response.
3. Maintain a natural flow in the conversation; don't force the inclusion of knowledge if it doesn't fit.
4. Use the knowledge to enhance your answer, provide context, or offer additional insights.
5. Balance between using the provided knowledge and your existing understanding.

Your goal is to craft a response that intelligently incorporates relevant knowledge while maintaining coherence and naturalness in the conversation.`
            )
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = formatPresetTemplate(preset, variables as any, true) as [
            BaseMessage[],
            string[]
        ]

        this._tempPreset = [preset, result]

        return result
    }

    async formatMessages({
        chat_history: chatHistory,
        input,
        variables,
        agent_scratchpad: agentScratchpad
    }: {
        input: BaseMessage
        chat_history: BaseMessage[] | string
        variables?: InputValues
        agent_scratchpad?: BaseMessage[] | BaseMessage
    }) {
        const result: BaseMessage[] = []
        let usedTokens = 0

        const [systemPrompts] = await this._formatSystemPrompts(variables)
        this._systemPrompts = systemPrompts

        for (const message of systemPrompts || []) {
            const messageTokens = await this._countMessageTokens(message)
            result.push(message)
            usedTokens += messageTokens
        }

        const inputTokens = await this.tokenCounter(input.content as string)
        const longHistory = (variables?.['long_memory'] ?? []) as Document[]
        const knowledge = (variables?.['knowledge'] ?? []) as Document[]
        const loreBooks = (variables?.['lore_books'] ?? []) as RoleBook[]
        const authorsNote = variables?.['authors_note'] as AuthorsNote
        const [formatAuthorsNote, usedTokensAuthorsNote] = authorsNote
            ? await this._counterAuthorsNote(authorsNote, variables as any)
            : [null, 0]
        usedTokens += inputTokens

        if (usedTokensAuthorsNote > 0) {
            // make authors note
            usedTokens += usedTokensAuthorsNote
        }

        if (agentScratchpad) {
            if (Array.isArray(agentScratchpad)) {
                usedTokens += await agentScratchpad.reduce(
                    async (accPromise, message) => {
                        const acc = await accPromise
                        const messageTokens =
                            await this._countMessageTokens(message)
                        return acc + messageTokens
                    },
                    Promise.resolve(0)
                )
            } else {
                usedTokens += await this._countMessageTokens(agentScratchpad)
            }
        }

        const formatResult = await this._formatWithMessagesPlaceholder(
            chatHistory as BaseMessage[],
            longHistory,
            knowledge,
            usedTokens
        )

        result.push(...formatResult.messages)
        usedTokens = formatResult.usedTokens

        if (loreBooks.length > 0) {
            usedTokens += await this._formatLoreBooks(
                loreBooks,
                usedTokens,
                result,
                variables
            )
        }

        result.push(input)

        if (formatAuthorsNote) {
            usedTokens = this._formatAuthorsNote(authorsNote, result, [
                formatAuthorsNote,
                usedTokensAuthorsNote
            ])
        }

        if (agentScratchpad) {
            if (Array.isArray(agentScratchpad)) {
                result.push(...agentScratchpad)
            } else {
                result.push(agentScratchpad)
            }
        }

        if (this.logger?.level === Logger.DEBUG) {
            this.logger?.debug(
                `Used tokens: ${usedTokens} exceed limit: ${this.sendTokenLimit}`
            )

            /*  const mapMessages = result.map((msg) => {
                const original = msg.toDict()
                const dict = structuredClone(original)
                delete dict.data.additional_kwargs['images']
                delete dict.data.additional_kwargs['preset']
                return dict
            }) */

            this.logger?.debug(`messages: ${JSON.stringify(result)})`)
        }

        return result
    }

    private async _formatLoreBooks(
        loreBooks: RoleBook[],
        usedTokens: number,
        result: BaseMessage[],
        variables: InputValues
    ) {
        const preset = this.tempPreset
        const tokenLimit =
            this.sendTokenLimit -
            usedTokens -
            (preset.loreBooks?.tokenLimit ?? 300)

        let usedToken = await this.tokenCounter(
            preset.config.loreBooksPrompt ?? '{input}'
        )

        const loreBooksPrompt = messagePromptTemplate(
            'user',
            preset.config.loreBooksPrompt ?? '{input}'
        )

        const canUseLoreBooks = {} as Record<
            RoleBook['insertPosition'] | 'default',
            string[]
        >

        const hasLongMemory =
            result[result.length - 1].content === 'Ok. I will remember.'

        for (const loreBook of loreBooks) {
            const loreBookTokens = await this.tokenCounter(loreBook.content)

            if (usedTokens + loreBookTokens > tokenLimit) {
                this.logger?.warn(
                    `Used tokens: ${usedTokens + loreBookTokens} exceed limit: ${tokenLimit}. Is too long lore books. Skipping.`
                )
                break
            }

            const position = loreBook.insertPosition ?? 'default'

            const array = canUseLoreBooks[position] ?? []
            array.push(loreBook.content)
            canUseLoreBooks[position] = array

            usedToken += loreBookTokens
        }

        for (const [position, array] of Object.entries(canUseLoreBooks)) {
            const message = formatMessages(
                [await loreBooksPrompt.format({ input: array.join('\n') })],
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                variables as any
            )[0]

            if (position === 'default') {
                if (hasLongMemory) {
                    const index = result.findIndex(
                        (msg) =>
                            msg.role === 'assistant' &&
                            msg.content === 'Ok. I will remember.'
                    )
                    index !== -1
                        ? result.splice(index - 1, 0, message)
                        : result.push(message)
                } else {
                    result.push(message)
                }
                return
            }

            const insertPosition = this._findIndex(
                result,
                position as RoleBook['insertPosition']
            )
            result.splice(insertPosition, 0, message)
        }

        return usedToken
    }

    private async _formatWithMessagesPlaceholder(
        chatHistory: BaseMessage[],
        longHistory: Document[],
        knowledge: Document[],
        usedTokens: number
    ): Promise<{ messages: BaseMessage[]; usedTokens: number }> {
        const result: BaseMessage[] = []

        for (const message of chatHistory.reverse()) {
            const messageTokens = await this._countMessageTokens(message)

            if (
                usedTokens + messageTokens >
                this.sendTokenLimit - (longHistory.length > 0 ? 480 : 80)
            ) {
                break
            }

            usedTokens += messageTokens
            result.unshift(message)
        }

        if (knowledge.length > 0) {
            usedTokens = await this._formatLongHistory(
                knowledge,
                chatHistory,
                usedTokens,
                result
            )
        }

        if (longHistory.length > 0) {
            usedTokens = await this._formatLongHistory(
                longHistory,
                result,
                usedTokens,
                result
            )
        }

        return { messages: result, usedTokens }
    }

    private async _counterAuthorsNote(
        authorsNote: AuthorsNote,
        variables?: Record<string, string>
    ): Promise<[string, number]> {
        const formatAuthorsNote = formatPresetTemplateString(
            authorsNote.content,
            variables
        )

        return [formatAuthorsNote, await this.tokenCounter(formatAuthorsNote)]
    }

    private _formatAuthorsNote(
        authorsNote: AuthorsNote,
        result: BaseMessage[],
        [formatAuthorsNote, usedTokens]: [string, number]
    ) {
        const rawPosition = authorsNote.insertPosition ?? 'in_chat'

        const insertPosition = this._findIndex(result, rawPosition)

        if (rawPosition === 'in_chat') {
            result.splice(insertPosition - (authorsNote.insertDepth ?? 0), 0, {
                role: 'system',
                content: formatAuthorsNote
            })
        } else {
            result.splice(insertPosition, 0, {
                role: 'system',
                content: formatAuthorsNote
            })
        }

        return usedTokens
    }

    private _findIndex(
        chatHistory: BaseMessage[],
        insertPosition:
            | PresetTemplate['loreBooks']['insertPosition']
            | PresetTemplate['authorsNote']['insertPosition']
            | 'before_char'
            | 'after_char'
    ) {
        if (insertPosition === 'in_chat') {
            return chatHistory.length - 1
        }

        const findIndexByType = (type: string) =>
            chatHistory.findIndex((message) => message.metadata?.type === type)

        const descriptionIndex = findIndexByType('description')
        const personalityIndex = findIndexByType('description')
        const scenarioIndex = findIndexByType('scenario')
        const exampleMessageStartIndex = findIndexByType(
            'example_message_first'
        )
        const exampleMessageEndIndex = findIndexByType('example_message_last')
        const firstMessageIndex = findIndexByType('first_message')

        const charDefIndex = Math.max(descriptionIndex, personalityIndex)

        switch (insertPosition) {
            case 'before_char_defs':
            case 'before_char':
                return charDefIndex !== -1 ? charDefIndex : 1

            case 'after_char_defs':
            case 'after_char':
                if (scenarioIndex !== -1) return scenarioIndex + 1
                return charDefIndex !== -1
                    ? charDefIndex + 1
                    : this._systemPrompts.length + 1

            case 'before_example_messages':
                if (exampleMessageStartIndex !== -1)
                    return exampleMessageStartIndex
                if (firstMessageIndex !== -1) return firstMessageIndex
                return charDefIndex !== -1 ? charDefIndex + 1 : 1

            case 'after_example_messages':
                if (exampleMessageEndIndex !== -1)
                    return exampleMessageEndIndex + 1
                return charDefIndex !== -1
                    ? charDefIndex + 1
                    : this._systemPrompts.length - 1

            default:
                return 1
        }
    }

    private async _formatLongHistory(
        longHistory: Document[],
        chatHistory: BaseMessage[] | string,
        usedTokens: number,
        result: BaseMessage[]
    ) {
        const formatDocuments: Document[] = []

        for (const document of longHistory) {
            const documentTokens = await this.tokenCounter(document.pageContent)

            if (usedTokens + documentTokens > this.sendTokenLimit - 80) {
                break
            }

            usedTokens += documentTokens
            formatDocuments.push(document)
        }

        const formatConversationSummary =
            formatDocuments.length > 0
                ? await this.conversationSummaryPrompt.format({
                      long_history: formatDocuments
                          .map(
                              (document) =>
                                  document.pageContent +
                                  ` metadata: ${JSON.stringify(document.metadata)}`
                          )
                          .join('\n'),
                      chat_history: chatHistory
                  })
                : null

        if (formatConversationSummary) {
            result.push(formatConversationSummary)
            result.push({
                role: 'assistant',
                content: 'Ok. I will remember.'
            })
        }

        return usedTokens
    }

    partial(values: PartialValues): BasePromptTemplate<BaseMessage[]> {
        throw new Error('Method not implemented.')
    }

    get tempPreset() {
        return this._tempPreset[0]
    }
}
