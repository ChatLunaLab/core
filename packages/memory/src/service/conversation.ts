import { ChatLunaError, ChatLunaErrorCode, sleep } from '@chatluna/utils'
import {
    ChatLunaConversation,
    ChatLunaConversationAdditional,
    ChatLunaConversationFilter,
    ChatLunaConversationTemplate,
    ChatLunaConversionFilterContext,
    ChatLunaMessage,
    ChatLunaUserConversation,
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
        extra: {
            userConversation: Omit<ChatLunaUserConversation, 'conversationId'>
            conversationAdditional?: Omit<
                ChatLunaConversationAdditional,
                'conversationId'
            >
        }
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
            'chatluna_user_conversation',
            Object.assign({}, extra.userConversation, {
                conversationId: conversation.id
            })
        )

        if (extra.conversationAdditional) {
            await this._database.create(
                'chatluna_conversation_additional',
                Object.assign({}, extra.conversationAdditional, {
                    conversationId: conversation.id
                })
            )
        }

        return conversation
    }

    async createConversationFilter(filter: ChatLunaConversationFilter) {
        if (filter.default_agent) {
            filter.priority = -1
        }

        await this._database.create(
            'chatluna_conversation_filter',
            Object.assign({}, filter)
        )
    }

    async resolveConversationFilter(
        agent: string,
        priority?: number,
        context?: ChatLunaConversionFilterContext
    ): Promise<ChatLunaConversationFilter | undefined> {
        let selection = this._database
            .select('chatluna_conversation_filter')
            .where({
                agent
            })
            .orderBy('priority', 'asc')

        if (priority) {
            selection = selection.where({
                priority: {
                    $gte: priority
                }
            })
        }

        const queried = await selection.execute()

        for (const filter of queried) {
            if (!filter) {
                return undefined
            }

            if (
                filter.platform != null &&
                filter.platform !== context?.platform
            ) {
                continue
            }

            if (filter.guildId != null && filter.guildId !== context?.guildId) {
                continue
            }

            if (filter.userId != null && filter.userId !== context?.userId) {
                continue
            }

            if (filter.agent != null && filter.agent !== context?.agent) {
                continue
            }

            return filter
        }

        return undefined
    }

    async useConversationFilter(
        agent: string,
        priority?: number,
        context?: ChatLunaConversionFilterContext,
        throwError: boolean = true
    ) {
        const filter = await this.resolveConversationFilter(
            agent,
            priority,
            context
        )

        if (!filter && throwError) {
            throw new ChatLunaError(
                ChatLunaErrorCode.CONVERSATION_FILTER_NOT_FOUND,
                `The query conversation filter with agent ${agent} is not found`
            )
        }

        if (!filter) {
            return undefined
        }

        const visibility = filter.visibility

        if (visibility === 'private') {
            const conversations = await this.queryConversationsByUser(
                context.userId
            )

            if (conversations.length === 0) {
                // need create conversation
                return true
            }

            return conversations.find(
                (conversation) => conversation[0].agent === filter.agent
            )[0]
        } else if (visibility === 'public') {
            const selection = this._database
                .select('chatluna_conversation_additional')
                .where({
                    visibility,
                    guildId: filter.guildId,
                    agent: filter.agent
                })

            const queried = await selection.execute()

            if (queried?.length !== 1) {
                return true
            }

            const additional = queried[0]

            return await this.resolveConversation(additional.conversationId)
        } else if (visibility === 'public_global') {
            const selection = this._database
                .select('chatluna_conversation_additional')
                .where({
                    visibility,
                    agent: filter.agent
                })

            const queried = await selection.execute()

            if (queried?.length < 0) {
                return true
            } else if (queried?.length > 1) {
                throw new ChatLunaError(
                    ChatLunaErrorCode.CONVERSATION_FILTER_NOT_FOUND,
                    `The query conversation filter with agent ${agent} is more than one`
                )
            }

            const additional = queried[0]

            return await this.resolveConversation(additional.conversationId)
        }
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
        agent: string | undefined = undefined
    ): Promise<[ChatLunaConversation, ChatLunaUserConversation][]> {
        const selection = this._database
            .select('chatluna_user_conversation')
            .where({
                userId,
                agent
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
    ): Promise<ChatLunaUserConversation> {
        let selection = this._database
            .select('chatluna_user_conversation')
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
        extra: ChatLunaUserConversation
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
            'chatluna_user_conversation',
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
    ): Promise<[ChatLunaConversation, ChatLunaUserConversation][]> {
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
                ['chatluna_conversation', 'chatluna_user_conversation'],
                (conversation, conversationAdditional) =>
                    $.eq(conversation.id, conversationAdditional.conversationId)
            )
            .where((rows) =>
                $.and(
                    $.eq(rows.chatluna_user_conversation.userId, userId),
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
            result.chatluna_user_conversation
        ])
    }

    async updateConversationAdditional(
        conversationId: string,
        userConversation:
            | Partial<ChatLunaUserConversation>
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
            await this._database.upsert('chatluna_user_conversation', [
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

        await sleep(1)
        if (needCrop) {
            return await this.cropMessages(conversation.id, maxMessageCount)
        }
    }

    async deleteAllConversation() {
        await this._database.remove('chatluna_conversation', {})
        await this._database.remove('chatluna_user_conversation', {})
        await this._database.remove('chatluna_message', {})
    }

    async deleteConversations(conversationIds: string[]): Promise<void> {
        await this._database.remove('chatluna_conversation', {
            id: conversationIds
        })

        await this._database.remove('chatluna_user_conversation', {
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
                agent: {
                    type: 'string'
                },
                model: {
                    type: 'string',
                    nullable: true
                },

                createdTime: {
                    type: 'timestamp'
                },
                name: {
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
            'chatluna_user_conversation',
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
                agent: {
                    type: 'string'
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

        this._database.extend(
            'chatluna_conversation_filter',
            {
                agent: {
                    type: 'string'
                },
                default_agent: {
                    type: 'boolean'
                },
                visibility: {
                    type: 'string'
                },
                priority: {
                    type: 'integer'
                },
                guildId: {
                    type: 'string',
                    nullable: true
                },
                userId: {
                    type: 'string',
                    nullable: true
                },
                platform: {
                    type: 'string',
                    nullable: true
                }
            },
            {
                primary: ['agent', 'priority']
            }
        )

        this._database.extend(
            'chatluna_conversation_additional',
            {
                guildId: {
                    type: 'string',
                    nullable: true
                },
                visibility: {
                    type: 'string'
                },
                agent: {
                    type: 'string',
                    nullable: true
                },
                conversationId: {
                    type: 'string'
                }
            },
            {
                primary: 'conversationId'
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
    chatluna_user_conversation: ChatLunaUserConversation
}>
