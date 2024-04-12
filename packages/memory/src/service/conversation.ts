import { ChatLunaError, ChatLunaErrorCode, sleep } from '@chatluna/core/utils'
import {
    ChatLunaConversation,
    ChatLunaConversationAdditional,
    ChatLunaConversationTemplate,
    ChatLunaMessage,
    ChatLunaTables,
    PartialOptional
} from '@chatluna/memory/types'
import { dateWithDays, generateUUID } from '@chatluna/memory/utils'
import type { Logger } from '@cordisjs/logger'
import { Context, Service } from 'cordis'
import { $, Database, Eval, Row } from 'minato'
import Expr = Eval.Expr

export class ChatLunaConversationService extends Service {
    private _logger: Logger

    constructor(ctx: Context) {
        super(ctx, 'chatluna_conversation')
        this._logger = ctx.logger('chatluna_conversation')
        this._defineDatabaseModel()
    }

    async createConversation(
        conversationTemplate: ChatLunaConversationTemplate,
        extra: Omit<ChatLunaConversationAdditional, 'conversationId'>
    ): Promise<ChatLunaConversation> {
        const createdTime = new Date()

        const conversation = Object.assign(
            {
                id: generateUUID(),
                createdTime,
                updatedTime: createdTime,
                latestMessageId: null,
                additional_kwargs: null
            },
            conversationTemplate
        ) satisfies ChatLunaConversation

        await this._database.create('chatluna_conversation', conversation)

        await this._database.create(
            'chatluna_conversation_additional',
            Object.assign(
                {
                    conversationId: conversation.id
                },
                extra
            )
        )

        return conversation
    }

    async resolveConversation(
        id: string,
        throwError: boolean = true
    ): Promise<ChatLunaConversation | undefined> {
        const queried = await this._database.get('chatluna_conversation', {
            id
        })

        if (queried?.length === 1) {
            return queried[0]
        }

        if (
            throwError &&
            (!queried || queried.length === 0 || queried.length > 1)
        ) {
            throw new ChatLunaError(
                ChatLunaErrorCode.CONVERSATION_NOT_FOUND,
                `The query conversation with id ${id} is not found or more than one`
            )
        }

        return undefined
    }

    async queryConversationsByUser(
        userId: string,
        guildId: string | undefined = undefined,
        defaultConversation: boolean | undefined = undefined
    ): Promise<[ChatLunaConversation, ChatLunaConversationAdditional][]> {
        let selection = this._database
            .select('chatluna_conversation_additional')
            .where({
                userId,
                guildId
            })

        if (defaultConversation) {
            selection = selection.where({
                default: defaultConversation
            })
        }

        const queried = await selection.execute()

        const conversations = await this._database
            .select('chatluna_conversation')
            .where({
                id: queried.map((additional) => additional.conversationId)
            })
            .execute()

        return queried.map((additional) => [
            conversations.find(
                (conversation) => conversation.id === additional.conversationId
            ),
            additional
        ])
    }

    async queryConversationAdditional(
        userId: string,
        guildId: string | undefined = undefined,
        defaultConversation: boolean | undefined = undefined,
        conversationId: string | undefined = undefined
    ): Promise<ChatLunaConversationAdditional> {
        let selection = this._database
            .select('chatluna_conversation_additional')
            .where({
                userId,
                guildId
            })

        if (defaultConversation) {
            selection = selection.where({
                default: defaultConversation
            })
        }

        if (conversationId) {
            selection = selection.where({
                conversationId
            })
        }

        const queried = await selection.execute()

        if (!queried || queried.length === 0 || queried.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.CONVERSATION_NOT_FOUND,
                `The query conversation with userId ${userId} is not found or more than one`
            )
        }

        return queried[0]
    }

    async cloneConversation(
        conversation: ChatLunaConversation | string,
        extra: ChatLunaConversationAdditional
    ): Promise<ChatLunaConversation> {
        const createdTime = new Date()

        const currentConversation =
            typeof conversation === 'string'
                ? await this.resolveConversation(conversation)
                : conversation

        const clonedConversation = Object.assign({}, currentConversation, {
            id: generateUUID(),
            createdTime,
            updatedTime: createdTime,
            latestMessageId: null,
            additional_kwargs: null
        }) satisfies ChatLunaConversation

        await this._database.create('chatluna_conversation', clonedConversation)
        await this._database.create(
            'chatluna_conversation_additional',
            Object.assign({}, extra, {
                conversationId: clonedConversation.id
            })
        )

        return clonedConversation
    }

    async resolveConversationByUser(
        userId: string,
        guildId: string | undefined = undefined,
        defaultConversation: boolean | undefined = undefined,
        lastUpdatedTime: Date = dateWithDays(-1)
    ): Promise<[ChatLunaConversation, ChatLunaConversationAdditional]> {
        const preparedQueries: ((rows: Rows) => Expr)[] = []

        if (guildId) {
            preparedQueries.push((rows) =>
                $.eq(rows.chatluna_conversation_additional.guildId, guildId)
            )
        }

        if (defaultConversation) {
            preparedQueries.push((rows) =>
                $.eq(rows.chatluna_conversation_additional.default, true)
            )
        }

        const queried = await this._database
            .join(
                ['chatluna_conversation', 'chatluna_conversation_additional'],
                (conversation, conversationAdditional) =>
                    $.eq(conversation.id, conversationAdditional.conversationId)
            )
            .where((rows) =>
                $.and(
                    $.eq(rows.chatluna_conversation_additional.userId, userId),
                    $.gte(
                        rows.chatluna_conversation.updatedTime,
                        lastUpdatedTime
                    ),
                    ...preparedQueries.map((query) => query(rows))
                )
            )
            .execute()

        if (!queried || queried.length === 0 || queried.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.CONVERSATION_NOT_FOUND,
                `The query conversation with userid ${userId} and guild id ${guildId} is not found or more than one`
            )
        }

        const result = queried[0]

        return [
            result.chatluna_conversation,
            result.chatluna_conversation_additional
        ]
    }

    async searchConversation(
        userId: string,
        guildId: string | undefined = undefined,
        fuzzyConversation:
            | Partial<ChatLunaConversationTemplate>
            | undefined = undefined,
        lastUpdatedTime: Date = dateWithDays(-1)
    ): Promise<[ChatLunaConversation, ChatLunaConversationAdditional][]> {
        const fuzzyQueries: ((rows: Rows) => Expr)[] = Object.keys(
            fuzzyConversation ?? []
        )
            .filter((prop) => fuzzyConversation[prop] !== undefined)
            .map((prop) => {
                const value = fuzzyConversation[prop]

                return (rows: Rows) =>
                    $.regex(rows.chatluna_conversation[prop], value)
            })

        if (guildId != null) {
            fuzzyQueries.push((rows) =>
                $.eq(rows.chatluna_conversation_additional.guildId, guildId)
            )
        }

        const queryResults = await this._database
            .join(
                ['chatluna_conversation', 'chatluna_conversation_additional'],
                (conversation, conversationAdditional) =>
                    $.eq(conversation.id, conversationAdditional.conversationId)
            )
            .where((rows) =>
                $.and(
                    $.eq(rows.chatluna_conversation_additional.userId, userId),
                    $.gte(
                        rows.chatluna_conversation.updatedTime,
                        lastUpdatedTime
                    ),
                    ...fuzzyQueries.map((query) => query(rows))
                )
            )
            .orderBy((rows) => rows.chatluna_conversation.updatedTime)
            .execute()

        return queryResults.map((result) => [
            result.chatluna_conversation,
            result.chatluna_conversation_additional
        ])
    }

    async updateConversationAdditional(
        conversationId: string,
        additional:
            | Partial<ChatLunaConversationAdditional>
            | undefined = undefined,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        additional_kwargs: Record<string, unknown> | undefined = undefined,
        userId: string | undefined = undefined,
        force: boolean = false
    ) {
        if (force || additional_kwargs) {
            await this._database.upsert('chatluna_conversation', [
                {
                    id: conversationId,
                    additional_kwargs
                }
            ])
        }

        if (force || (additional && userId)) {
            await this._database.upsert('chatluna_conversation_additional', [
                {
                    conversationId,
                    userId,
                    ...additional
                }
            ])
        }
    }

    async fetchAllMessages(conversationId: string): Promise<ChatLunaMessage[]> {
        return await this._database
            .select('chatluna_message')
            .where({
                conversationId
            })
            .orderBy('createdTime', 'asc')
            .execute()
    }

    async addMessage(
        conversationId: string,
        rawMessage: PartialOptional<
            ChatLunaMessage,
            'createdTime' | 'parentId' | 'conversationId' | 'id'
        >,
        needCrop: boolean = false,
        maxMessageCount: number = 1000
    ) {
        const conversation = await this.resolveConversation(conversationId)

        const message: ChatLunaMessage = Object.assign({}, rawMessage, {
            id: generateUUID(),
            conversationId,
            createdTime: new Date(),
            parentId: conversation.latestMessageId
        })

        await this._database.create('chatluna_message', message)

        conversation.latestMessageId = message.id

        await this._database.upsert('chatluna_conversation', [conversation])

        await sleep(1)
        if (needCrop) {
            return await this.cropMessages(conversation.id, maxMessageCount)
        }
    }

    async deleteAllConversation() {
        await this._database.remove('chatluna_conversation', {})
        await this._database.remove('chatluna_conversation_additional', {})
        await this._database.remove('chatluna_message', {})
    }

    async deleteConversationsByUser(
        userId: string,
        guildId: string | undefined = undefined,
        defaultConversation: boolean = false,
        lastUpdatedTime: Date | undefined = undefined
    ) {
        const preparedQueries: ((rows: Rows) => Expr)[] = []

        if (guildId) {
            preparedQueries.push((rows) =>
                $.eq(rows.chatluna_conversation_additional.guildId, guildId)
            )
        }

        if (defaultConversation) {
            preparedQueries.push((rows) =>
                $.eq(rows.chatluna_conversation_additional.default, true)
            )
        }
        const queryResults = await this._database
            .join(
                ['chatluna_conversation', 'chatluna_conversation_additional'],
                (conversation, conversationAdditional) =>
                    $.eq(conversation.id, conversationAdditional.conversationId)
            )
            .where((rows) =>
                $.and(
                    $.eq(rows.chatluna_conversation_additional.userId, userId),
                    $.gte(
                        rows.chatluna_conversation.updatedTime,
                        lastUpdatedTime
                    ),
                    ...preparedQueries.map((query) => query(rows))
                )
            )
            .orderBy((rows) => rows.chatluna_conversation.updatedTime)
            .execute()

        await this.deleteConversations(
            queryResults.map((result) => result.chatluna_conversation.id)
        )
    }

    async deleteConversations(conversationIds: string[]): Promise<void> {
        await this._database.remove('chatluna_conversation', {
            id: conversationIds
        })

        await this._database.remove('chatluna_conversation_additional', {
            conversationId: conversationIds
        })

        await this._database.remove('chatluna_message', {
            conversationId: conversationIds
        })
    }

    async deleteConversation(
        conversation: string | ChatLunaConversation
    ): Promise<void> {
        const conversationId =
            typeof conversation === 'string' ? conversation : conversation.id

        await this.deleteConversations([conversationId])
    }

    async clearMessages(conversationId: string): Promise<void> {
        await this._database.remove('chatluna_message', {
            conversationId
        })
    }

    async cropMessages(conversationId: string, maxMessageCount: number) {
        // 100 - 200
        const maxMessages = await this._database
            .select('chatluna_message')
            .where({
                conversationId
            })
            .orderBy('createdTime', 'desc')
            .limit(maxMessageCount)
            .execute()

        let removeMessagesCount = await this._database
            .remove('chatluna_message', (rows) =>
                $.nin(
                    rows.id,
                    maxMessages.map((message) => message.id)
                )
            )
            .then((result) => result.removed)

        // query first three messages

        const firstMessages = await this._database
            .select('chatluna_message')
            .where({
                conversationId
            })
            .orderBy('createdTime', 'asc')
            .limit(3)
            .execute()

        /* c8 ignore next 3 */
        if (firstMessages.length < 1) {
            return removeMessagesCount
        }

        let first = firstMessages[0]

        if (first.role === 'ai') {
            await this._database.remove('chatluna_message', {
                id: first.id
            })
            firstMessages.shift()
            removeMessagesCount++
        }

        first = firstMessages[0]

        first.parentId = undefined

        await this._database.upsert('chatluna_message', [first])

        return removeMessagesCount
    }

    private get _database() {
        return this.ctx.database as Database<Context, ChatLunaTables>
    }

    private _defineDatabaseModel() {
        this._database.extend(
            'chatluna_conversation',
            {
                id: {
                    type: 'string'
                },
                latestMessageId: {
                    type: 'string',
                    nullable: true
                },
                updatedTime: {
                    type: 'timestamp'
                },
                additional_kwargs: {
                    type: 'json',
                    nullable: true
                },
                preset: {
                    type: 'string'
                },
                model: {
                    type: 'string'
                },
                chatMode: {
                    type: 'string'
                },
                createdTime: {
                    type: 'timestamp'
                }
            },
            {
                primary: 'id',
                foreign: {
                    latestMessageId: ['chatluna_message', 'id']
                }
            }
        )

        this._database.extend(
            'chatluna_message',
            {
                id: {
                    type: 'string'
                },
                createdTime: {
                    type: 'timestamp'
                },
                content: {
                    type: 'json'
                },
                role: {
                    type: 'string'
                },
                conversationId: {
                    type: 'string'
                },
                name: {
                    type: 'string',
                    nullable: true
                },
                parentId: {
                    type: 'string',
                    nullable: true
                },
                additional_kwargs: {
                    type: 'json',
                    nullable: true
                }
            },
            {
                primary: 'id',
                foreign: {
                    conversationId: ['chatluna_conversation', 'id']
                }
            }
        )

        this._database.extend(
            'chatluna_conversation_additional',
            {
                conversationId: {
                    type: 'string'
                },
                userId: {
                    type: 'string'
                },
                owner: {
                    type: 'boolean'
                },
                mute: {
                    type: 'boolean',
                    nullable: true
                },
                private: {
                    type: 'boolean',
                    nullable: true
                },
                default: {
                    type: 'boolean',
                    nullable: true
                },
                guildId: {
                    type: 'string',
                    nullable: true
                }
            },
            {
                primary: 'conversationId',
                foreign: {
                    userId: ['chatluna_user', 'userId'],
                    conversationId: ['chatluna_conversation', 'conversationId']
                }
            }
        )
    }

    static inject = {
        required: ['database', 'logger']
    }
}

declare module 'cordis' {
    interface Context {
        chatluna_conversation: ChatLunaConversationService
    }
}

type Rows = Row<{
    chatluna_conversation: ChatLunaConversation
    chatluna_conversation_additional: ChatLunaConversationAdditional
}>
