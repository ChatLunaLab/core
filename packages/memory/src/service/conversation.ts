import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import {
    ChatLunaAssistantTemplate,
    ChatLunaConversation,
    ChatLunaConversationGroup,
    ChatLunaConversationTemplate,
    ChatLunaConversationUser,
    ChatLunaMessage,
    PartialOptional
} from '@chatluna/memory/types'
import { dateWithDays, generateUUID } from '@chatluna/memory/utils'
import type { Logger } from '@cordisjs/logger'
import { Context, Service } from 'cordis'
import { $, Eval, Row } from 'minato'
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
        userConversation: Omit<ChatLunaConversationUser, 'conversationId'>
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
            'chatluna_conversation_user',
            Object.assign({}, userConversation, {
                conversationId: conversation.id
            })
        )

        return conversation
    }

    async createAssistant(assistant: ChatLunaAssistantTemplate) {
        const id = generateUUID()

        await this._database.create('chatluna_assistant', {
            id,
            ...assistant
        })
    }

    async deleteAssistant(id: string) {
        await this._database.remove('chatluna_assistant', {
            id
        })
    }

    async updateAssistant(assistant: ChatLunaAssistantTemplate) {
        await this._database.upsert('chatluna_assistant', [
            {
                ...assistant
            }
        ])
    }

    async createConversationGroup(
        group: ChatLunaConversationGroup
    ): Promise<ChatLunaConversationGroup> {
        await this._database.create('chatluna_conversation_group', group)
        await this.joinConversationGroup(group.ownerId, group.id)
        return group
    }

    async joinConversationGroup(userId: string, groupId: string) {
        await this._database.create('chatluna_conversation_group_user', {
            userId,
            guildId: groupId
        })
    }

    async leaveConversationGroup(userId: string, groupId: string) {
        await this._database.remove('chatluna_conversation_group_user', {
            userId,
            guildId: groupId
        })
    }

    async isInConversationGroup(
        userId: string,
        groupId: string
    ): Promise<boolean> {
        const queried = await this._database.get(
            'chatluna_conversation_group_user',
            {
                userId,
                guildId: groupId
            }
        )
        return queried.length === 1
    }

    async resolveConversationGroup(name: string) {
        const queried = await this._database.get(
            'chatluna_conversation_group',
            {
                name
            }
        )

        if (!queried || queried.length === 0 || queried.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.CONVERSATION_GROUP_NOT_FOUND,
                `The query conversation group with name ${name} is not found or more than one`
            )
        }

        return queried[0]
    }

    async updateConversationGroup(
        group: ChatLunaConversationGroup
    ): Promise<ChatLunaConversationGroup> {
        await this._database.upsert('chatluna_conversation_group', [group])
        return group
    }

    async deleteConversationGroup(id: string) {
        await this._database.remove('chatluna_conversation_group', {
            id
        })
    }

    async resolveAssistantByName(name: string) {
        const queried = await this._database.get('chatluna_assistant', {
            name
        })
        if (!queried || queried.length === 0 || queried.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.ASSISTANT_NOT_FOUND,
                `The query assistant with name ${name} is not found or more than one: ${JSON.stringify(
                    queried
                )}`
            )
        }
        return queried[0]
    }

    async getAllAssistant() {
        const queried = await this._database.get('chatluna_assistant', {})

        return queried
    }

    async getAssistant(id: string) {
        const queried = await this._database.get('chatluna_assistant', {
            id
        })
        if (!queried || queried.length === 0 || queried.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.ASSISTANT_NOT_FOUND,
                `The query assistant with id ${id} is not found or more than one: ${JSON.stringify(
                    queried
                )}`
            )
        }
        return queried[0]
    }

    async deleteAssistantByName(name: string) {
        const queried = await this._database.get('chatluna_assistant', {
            name
        })
        if (!queried || queried.length === 0 || queried.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.ASSISTANT_NOT_FOUND,
                `The query assistant with name ${name} is not found or more than one: ${JSON.stringify(
                    queried
                )}`
            )
        }
        await this._database.remove('chatluna_assistant', {
            name
        })
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
        assistant: string | undefined = undefined
    ): Promise<[ChatLunaConversation, ChatLunaConversationUser][]> {
        const selection = this._database
            .select('chatluna_conversation_user')
            .where({
                userId,
                assistant
            })

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

    async resolveUserConversation(
        userId: string,
        conversationId: string | undefined = undefined
    ): Promise<ChatLunaConversationUser> {
        let selection = this._database
            .select('chatluna_conversation_user')
            .where({
                userId
            })

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
        extra: ChatLunaConversationUser
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
            'chatluna_conversation_user',
            Object.assign({}, extra, {
                conversationId: clonedConversation.id
            })
        )

        return clonedConversation
    }

    async searchConversation(
        userId: string,
        fuzzyConversation:
            | Partial<ChatLunaConversationTemplate>
            | undefined = undefined,
        lastUpdatedTime: Date = dateWithDays(-1)
    ): Promise<[ChatLunaConversation, ChatLunaConversationUser][]> {
        const fuzzyQueries: ((rows: Rows) => Expr)[] = Object.keys(
            fuzzyConversation ?? []
        )
            .filter((prop) => fuzzyConversation[prop] !== undefined)
            .map((prop) => {
                const value = fuzzyConversation[prop]

                return (rows: Rows) =>
                    $.regex(rows.chatluna_conversation[prop], value)
            })

        const queryResults = await this._database
            .join(
                ['chatluna_conversation', 'chatluna_conversation_user'],
                (conversation, conversationAdditional) =>
                    $.eq(conversation.id, conversationAdditional.conversationId)
            )
            .where((rows) =>
                $.and(
                    $.eq(rows.chatluna_conversation_user.userId, userId),
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
            result.chatluna_conversation_user
        ])
    }

    async updateConversationAdditional(
        conversationId: string,
        userConversation:
            | Partial<ChatLunaConversationUser>
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

        if (force || (userConversation && userId)) {
            await this._database.upsert('chatluna_conversation_user', [
                {
                    conversationId,
                    userId,
                    ...userConversation
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

        if (needCrop) {
            return await this.cropMessages(conversation.id, maxMessageCount)
        }
    }

    async deleteAllConversation() {
        await this._database.remove('chatluna_conversation', {})
        await this._database.remove('chatluna_conversation_user', {})
        await this._database.remove('chatluna_message', {})
    }

    async deleteConversations(conversationIds: string[]): Promise<void> {
        await this._database.remove('chatluna_conversation', {
            id: conversationIds
        })

        await this._database.remove('chatluna_conversation_user', {
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
        return this.ctx.database
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
                assistant: {
                    type: 'string'
                },

                createdTime: {
                    type: 'timestamp'
                },
                title: {
                    type: 'string',
                    nullable: true
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
            'chatluna_conversation_user',
            {
                userId: 'string',
                conversationId: 'string',
                assistant: 'string'
            },
            {
                primary: ['userId', 'conversationId']
            }
        )

        this._database.extend('chatluna_conversation_group_user', {
            userId: 'string',
            guildId: 'string',
            isAssistant: {
                type: 'boolean',
                initial: false
            }
        })

        this._database.extend(
            'chatluna_assistant',
            {
                id: 'string',
                name: 'string',
                preset: 'string',
                model: 'string',
                description: {
                    type: 'string',
                    nullable: true
                },
                avatar: {
                    type: 'string',
                    nullable: true
                },
                tools: {
                    type: 'json',
                    nullable: true
                },
                files: {
                    type: 'array',
                    nullable: true
                }
            },
            {
                primary: ['id']
            }
        )

        this._database.extend(
            'chatluna_conversation_group',
            {
                guildId: {
                    type: 'string'
                },
                conversationId: {
                    type: 'string'
                },
                id: {
                    type: 'string'
                },
                name: {
                    type: 'string'
                },
                ownerId: {
                    type: 'string'
                },
                // true: public false: private
                visible: {
                    type: 'boolean'
                },
                memberCount: {
                    type: 'integer',
                    initial: 1
                }
            },
            {
                primary: 'id',
                foreign: {
                    conversationId: ['chatluna_conversation', 'id']
                }
            }
        )
    }

    static inject = ['database', 'logger']
}

declare module 'cordis' {
    interface Context {
        chatluna_conversation: ChatLunaConversationService
    }
}

type Rows = Row<{
    chatluna_conversation: ChatLunaConversation
    chatluna_conversation_user: ChatLunaConversationUser
}>
