import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import {
    ChatLunaUser,
    ChatLunaUserAdditional,
    ChatLunaUserAgentAdditional,
    ChatLunaUserGroup,
    PartialOptional
} from '@chatluna/memory/types'
import { startOfCurrentDay } from '@chatluna/memory/utils'
import type { Logger } from '@cordisjs/logger'
import { Context, Service } from 'cordis'
import { $ } from 'minato'

export class ChatLunaUserService extends Service {
    private _logger: Logger

    constructor(ctx: Context) {
        super(ctx, 'chatluna_user')
        this._logger = ctx.logger('chatluna_user')
        this._defineDatabaseModel()
    }

    async queryUser(userId: string, autoCreate: boolean = true) {
        const queries = await this._database.get('chatluna_user', {
            userId
        })

        if (queries.length === 1) {
            return queries[0]
        }

        if (queries.length !== 1 && !autoCreate) {
            throw new ChatLunaError(
                ChatLunaErrorCode.USER_NOT_FOUND,
                `User ${userId} not found or duplicate`
            )
        }

        return await this.createUser(userId)
    }

    async removeUser(userId: string) {
        const queries = await this._database.get('chatluna_user', {
            userId
        })

        if (queries.length === 0) {
            throw new ChatLunaError(
                ChatLunaErrorCode.USER_NOT_FOUND,
                `User ${userId} not found`
            )
        }

        await Promise.all([
            this._database.remove('chatluna_user', {
                userId
            }),
            this._database.remove('chatluna_user_additional', {
                userId
            })
        ])
    }

    async createUser(userId: string, template?: Partial<ChatLunaUser>) {
        const promise1 = this._database.create(
            'chatluna_user',
            Object.assign(
                {
                    userId,
                    balance: 0,
                    lastChatTime: new Date()
                },
                template ?? {}
            )
        )

        const promise2 = this._database.create('chatluna_user_additional', {
            userId,
            lastLimitPerDay: 0,
            lastLimitPerMin: 0
        })

        const values = await Promise.all([promise1, promise2])
        return values[0]
    }

    createUserGroup(group: PartialOptional<ChatLunaUserGroup, 'id'>) {
        return this._database.create('chatluna_user_group', group)
    }

    async queryUserGroup(groupId: number) {
        const queries = await this._database.get('chatluna_user_group', {
            id: groupId
        })

        if (queries?.length === 1) {
            return queries[0]
        }

        throw new ChatLunaError(
            ChatLunaErrorCode.USER_GROUP_NOT_FOUND,
            `Group ${groupId} not found`
        )
    }

    async queryUserGroupByName(name: string) {
        const queries = await this._database.get('chatluna_user_group', {
            name
        })

        if (queries?.length === 1) {
            return queries[0]
        }

        throw new ChatLunaError(
            ChatLunaErrorCode.USER_GROUP_NOT_FOUND,
            `Group ${name} not found`
        )
    }

    async queryUserAdditional(userId: string) {
        const queries = await this._database.get('chatluna_user_additional', {
            userId
        })

        if (queries?.length === 1) {
            return queries[0]
        }

        throw new ChatLunaError(
            ChatLunaErrorCode.USER_NOT_FOUND,
            `User ${userId} not found`
        )
    }

    async removeUserGroup(groupId: number) {
        const queries = await this._database.get('chatluna_user_group', {
            id: groupId
        })

        if (queries?.length === 0) {
            throw new ChatLunaError(
                ChatLunaErrorCode.USER_GROUP_NOT_FOUND,
                `Group ${groupId} not found`
            )
        }

        await this._database.remove('chatluna_user_group', {
            id: groupId
        })
    }

    async queryUserWithAdditional(
        userId: string
    ): Promise<[ChatLunaUser, ChatLunaUserAdditional]> {
        const queries = await this._database
            .join(
                ['chatluna_user', 'chatluna_user_additional'],
                (user, additional) => $.eq(user.userId, additional.userId)
            )
            .where((row) =>
                $.and(
                    $.eq(row.chatluna_user.userId, userId),
                    $.eq(row.chatluna_user_additional.userId, userId)
                )
            )
            .execute()

        if (queries?.length === 1) {
            const result = queries[0]
            return [result.chatluna_user, result.chatluna_user_additional]
        }

        throw new ChatLunaError(
            ChatLunaErrorCode.USER_NOT_FOUND,
            `User ${userId} not found`
        )
    }

    async updateUser(
        userId: string,
        templateUser: Partial<ChatLunaUser>,
        templateUserAdditional?: Partial<ChatLunaUserAdditional>,
        force: boolean = false
    ) {
        await this._database.upsert('chatluna_user', [
            Object.assign(
                {
                    userId
                },
                templateUser
            )
        ])

        if (templateUserAdditional != null || force) {
            await this._database.upsert('chatluna_user_additional', [
                Object.assign(
                    {
                        userId
                    },
                    templateUserAdditional ?? {}
                )
            ])
        }
    }

    async updateUserGroup(
        groupId: number,
        template: Partial<ChatLunaUserGroup>
    ) {
        await this._database.upsert('chatluna_user_group', [
            Object.assign(
                {
                    id: groupId
                },
                template
            )
        ])
    }

    async queryUserAgents(userId: string) {
        const queries = await this._database.get(
            'chatluna_user_agent_additional',
            {
                userId
            }
        )

        if (queries?.length === 0) {
            return []
        }

        return queries
    }

    async queryUserAgent(userId: string, agentId: string) {
        const queries = await this._database.get(
            'chatluna_user_agent_additional',
            {
                userId,
                agentId
            }
        )

        if (queries?.length === 1) {
            return queries[0]
        }

        throw new ChatLunaError(
            ChatLunaErrorCode.USER_NOT_FOUND,
            `Agent ${agentId} not found`
        )
    }

    async updateUserPreset(
        userId: string,
        presetId: string,
        template: Partial<ChatLunaUserAgentAdditional>
    ) {
        await this._database.upsert('chatluna_user_agent_additional', [
            Object.assign(
                {
                    userId,
                    presetId
                },
                template
            )
        ])
    }

    async updateChatTime(userId: string, currentTime: Date /* = new Date() */) {
        const [user, additional] = await this.queryUserWithAdditional(userId)

        const { lastChatTime } = user

        const currentDayOfStart = startOfCurrentDay(currentTime).getTime()

        // If the last call time is not today, then all zeroed out
        if (lastChatTime.getTime() < currentDayOfStart) {
            additional.lastLimitPerDay = 1
            additional.lastLimitPerMin = 1

            // Check to see if it's been more than a minute since the last call
        } else if (currentTime.getTime() - lastChatTime.getTime() >= 60000) {
            additional.lastLimitPerDay += 1
            additional.lastLimitPerMin = 1
        } else {
            additional.lastLimitPerDay += 1
            additional.lastLimitPerMin += 1
        }

        user.lastChatTime = currentTime

        await this.updateUser(userId, user, additional)

        return [user, additional]
    }

    private get _database() {
        return this.ctx.database
    }

    private _defineDatabaseModel() {
        this._database.extend(
            'chatluna_user',
            {
                userId: {
                    type: 'string'
                },
                balance: {
                    type: 'double',
                    nullable: true
                },
                chatTimeLimitPerMin: {
                    type: 'integer'
                },
                lastChatTime: {
                    type: 'timestamp',
                    nullable: true
                },
                userGroupId: {
                    type: 'list',
                    nullable: true
                },
                excludeModels: {
                    type: 'list',
                    nullable: true
                },
                lastChatConversationId: {
                    type: 'string',
                    nullable: true
                },
                defaultAgent: {
                    type: 'string',
                    nullable: true
                }
            },
            {
                primary: 'userId'
            }
        )

        this._database.extend(
            'chatluna_user_additional',
            {
                userId: {
                    type: 'string'
                },
                lastLimitPerMin: {
                    type: 'double',
                    nullable: true
                },
                lastLimitPerDay: {
                    type: 'double',
                    nullable: true
                }
            },
            {
                primary: 'userId',

                foreign: {
                    userId: ['chatluna_user', 'userId']
                }
            }
        )

        this._database.extend(
            'chatluna_user_group',
            {
                name: {
                    type: 'string'
                },
                id: {
                    type: 'integer'
                },
                limitPerMin: {
                    type: 'integer'
                },
                limitPerDay: {
                    type: 'integer'
                },
                costPerInputToken: {
                    type: 'double'
                },
                costPerOutputToken: {
                    type: 'double'
                },
                supportModels: {
                    type: 'list'
                }
            },
            {
                primary: 'id',
                autoInc: true
            }
        )

        this._database.extend(
            'chatluna_user_agent_additional',
            {
                userId: {
                    type: 'string'
                },
                agentId: {
                    type: 'string'
                },
                additional_kwargs: {
                    type: 'json'
                }
            },
            {
                primary: ['userId', 'agentId'],
                autoInc: true
            }
        )
    }

    static inject = ['database']
}

// wait minato update
declare module 'cordis' {
    interface Context {
        chatluna_user: ChatLunaUserService
    }
}
