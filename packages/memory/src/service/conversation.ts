import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/core/utils'
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
import { $, Database, Query } from 'minato'

export class ChatLunaConversationService extends Service {
    private _logger: Logger

    constructor(ctx: Context) {
        super(ctx, 'chatluna_conversation')
        this._logger = ctx.logger('chatluna_conversation')
        this._defineDatabaseModel()
    }

    async createConversation(
        conversationTemplate: ChatLunaConversationTemplate,
        extra: ChatLunaConversationAdditional
    ): Promise<ChatLunaConversation> {
        const createdTime = new Date()

        const conversation = {
            id: generateUUID(),
            createdTime,
            updatedTime: createdTime,
            ...conversationTemplate
        } satisfies ChatLunaConversation

        await this._database.create('chatluna_conversation', conversation)
        await this._database.create('chatluna_conversation_additional', extra)

        return conversation
    }

    async resolveConversation(
        id: string,
        throwError: boolean = true
    ): Promise<ChatLunaConversation | undefined> {
        const queried = await this._database.get('chatluna_conversation', {
            id
        })

        if (
            throwError &&
            (!queried || queried.length === 0 || queried.length > 1)
        ) {
            throw new ChatLunaError(
                ChatLunaErrorCode.CONVERSATION_NOT_FOUND,
                `The query conversation with id ${id} is not found or more than one`
            )
        }

        return queried?.[0]
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

        const clonedConversation = {
            id: generateUUID(),
            createdTime,
            updatedTime: createdTime,
            ...currentConversation
        } satisfies ChatLunaConversation

        await this._database.create('chatluna_conversation', clonedConversation)
        await this._database.create('chatluna_conversation_additional', extra)

        return clonedConversation
    }

    async resolveConversationByUser(
        userId: string,
        guildId: string | undefined = undefined,
        defaultConversation: boolean | undefined = undefined,
        lastUpdatedTime: Date = dateWithDays(1)
    ): Promise<[ChatLunaConversation, ChatLunaConversationAdditional]> {
        const queried = await this._database
            .join(
                [
                    'chatluna_conversation',
                    'chatluna_conversation_additional'
                ] as const,
                (conversation, conversationAdditional) =>
                    $.eq(conversation.id, conversationAdditional.conversationId)
            )
            .where({
                'chatluna_conversation_additional.guildId': guildId,
                'chatluna_conversation_additional.userId': userId,
                'chatluna_conversation.updatedTime': {
                    $gte: lastUpdatedTime
                },
                ...(defaultConversation
                    ? {
                          'chatluna_conversation_additional.defaultConversation':
                              true
                      }
                    : {})
            })
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
        lastUpdatedTime: Date = dateWithDays(1)
    ): Promise<[ChatLunaConversation, ChatLunaConversationAdditional][]> {
        const queryContent: Query<{
            chatluna_conversation: ChatLunaConversation
            chatluna_conversation_additional: ChatLunaConversationAdditional
        }> = {
            'chatluna_conversation_additional.guildId': guildId,
            'chatluna_conversation_additional.userId': userId,
            'chatluna_conversation.updatedTime': {
                $gte: lastUpdatedTime
            }
        }

        for (const prop in fuzzyConversation ?? []) {
            if (fuzzyConversation[prop] !== undefined) {
                queryContent[`chatluna_conversation.${prop}`] =
                    fuzzyConversation[prop]
            }
        }

        const queryResults = await this._database
            .join(
                [
                    'chatluna_conversation',
                    'chatluna_conversation_additional'
                ] as const,
                (conversation, conversationAdditional) =>
                    $.eq(conversation.id, conversationAdditional.conversationId)
            )
            .where(queryContent)
            .orderBy((rows) => rows.chatluna_conversation.updatedTime)
            .execute()
        return queryResults.map((result) => [
            result.chatluna_conversation,
            result.chatluna_conversation_additional
        ])
    }

    async updateConversationAdditional(
        conversationId: string,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        additional_kwargs: Record<string, unknown> | undefined = undefined,
        additional: ChatLunaConversationAdditional | undefined = undefined,
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

        if (force || additional) {
            await this._database.upsert('chatluna_conversation_additional', [
                {
                    conversationId,
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
            .orderBy('createdTime', 'desc')
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

        const message: ChatLunaMessage = {
            ...rawMessage,
            id: generateUUID(),
            conversationId,
            createdTime: new Date(),
            parentId: conversation.latestMessageId
        }

        await this._database.create('chatluna_message', message)

        conversation.latestMessageId = message.id

        await this._database.upsert('chatluna_conversation', [conversation])

        if (needCrop) {
            return await this.cropMessages(conversation.id, maxMessageCount)
        }
    }

    async deleteAllConversation() {
        await this._database.remove('chatluna_conversation', {})
    }

    async deleteConversationsByUser(
        userId: string,
        guildId: string | undefined = undefined,
        deleteDefaultConversation: boolean = false,
        lastUpdatedTime: Date | undefined = undefined
    ) {
        const queryContent: Query<{
            chatluna_conversation: ChatLunaConversation
            chatluna_conversation_additional: ChatLunaConversationAdditional
        }> = {
            'chatluna_conversation_additional.guildId': guildId,
            'chatluna_conversation_additional.userId': userId
        }

        if (lastUpdatedTime) {
            queryContent['chatluna_conversation.updatedTime'] = {
                $lte: lastUpdatedTime
            }
        }

        if (!deleteDefaultConversation) {
            queryContent[
                'chatluna_conversation_additional.defaultConversation'
            ] = {
                $or: [undefined, false]
            }
        }

        const queryResults = await this._database
            .join(
                [
                    'chatluna_conversation',
                    'chatluna_conversation_additional'
                ] as const,
                (conversation, conversationAdditional) =>
                    $.eq(conversation.id, conversationAdditional.conversationId)
            )
            .where(queryContent)
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
            .then((result) => result.map((message) => message.id))

        const selection = this._database.select('chatluna_message').where({
            id: {
                $not: {
                    $in: maxMessages
                }
            }
        })

        let removeMessagesCount = await this._database
            .remove('chatluna_message', selection.query)
            .then((result) => result.removed)

        // query first three messages

        const firstMessages = await this._database
            .select('chatluna_message')
            .where({
                conversationId
            })
            .orderBy('createdTime', 'desc')
            .limit(3)
            .execute()

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
        // return this.ctx.database as Database<ChatLunaTables>
        // wait minato update

        return this.ctx.database as unknown as Database<ChatLunaTables>
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
                    type: 'date'
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
                    type: 'date'
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
                    type: 'date'
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
                }
            },
            {
                foreign: {
                    userId: ['chatluna_user', 'userId'],
                    conversationId: ['chatluna_conversation', 'id']
                }
            }
        )
    }

    static inject = {
        required: ['database', 'logger']
    }
}

// wait minato update
declare module 'cordis' {
    interface Context {
        database: Database
        chatluna_conversation: ChatLunaConversationService
    }
}
