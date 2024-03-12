import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/core/utils'
import {
    ChatLunaTables,
    ChatLunaUser,
    ChatLunaUserAdditional
} from '@chatluna/memory/types'
import type { Logger } from '@cordisjs/logger'
import { Context, Service } from 'cordis'
import { $, Database } from 'minato'

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

        if (queries.length === 0 && !autoCreate) {
            throw new ChatLunaError(
                ChatLunaErrorCode.USER_NOT_FOUND,
                `User ${userId} not found`
            )
        }

        if (queries.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.USER_ARE_DUPLICATE,
                `User ${userId} is duplicate`
            )
        } else {
            return await this.createUser(userId)
        }
    }

    createUser(userId: string, template?: ChatLunaUser) {
        return this._database.create(
            'chatluna_user',
            Object.assign(
                {
                    userId,
                    balance: 0
                },
                template ?? {}
            )
        )
    }

    async queryUserGroup(groupId: number) {
        const queries = await this._database.get('chatluna_user_group', {
            id: groupId
        })

        if (queries?.length === 1) {
            return queries[0]
        }

        if (queries?.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.USER_GROUP_ARE_DUPLICATE,
                `Group ${groupId} is duplicate`
            )
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

        if (queries?.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.USER_GROUP_ARE_DUPLICATE,
                `Group ${name} is duplicate`
            )
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

        if (queries?.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.USER_ARE_DUPLICATE,
                `User ${userId} is duplicate`
            )
        }

        throw new ChatLunaError(
            ChatLunaErrorCode.USER_NOT_FOUND,
            `User ${userId} not found`
        )
    }

    async queryUserWithAdditional(
        userId: string
    ): Promise<[ChatLunaUser, ChatLunaUserAdditional]> {
        const queries = await this._database
            .join(
                ['chatluna_user', 'chatluna_user_additional'] as const,
                (user, additional) => $.eq(user.userId, additional.userId)
            )
            .execute()

        if (queries?.length === 1) {
            const result = queries[0]
            return [result.chatluna_user, result.chatluna_user_additional]
        }

        if (queries?.length > 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.USER_ARE_DUPLICATE,
                `User ${userId} is duplicate`
            )
        }

        throw new ChatLunaError(
            ChatLunaErrorCode.USER_NOT_FOUND,
            `User ${userId} not found`
        )
    }

    private get _database() {
        // return this.ctx.database as Database<ChatLunaTables>
        // wait minato update

        return this.ctx.database as unknown as Database<ChatLunaTables>
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
                    type: 'date',
                    nullable: true
                },
                lastChatTime: {
                    type: 'date',
                    nullable: true
                },
                userGroupId: {
                    type: 'list',
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
                costPerToken: {
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
    }

    static inject = {
        required: ['database', 'logger']
    }
}

// wait minato update
declare module 'cordis' {
    interface Context {
        database: Database
        chatluna_user: ChatLunaUserService
    }
}
