import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/core/utils'
import { ChatLunaTables } from '@chatluna/memory/types'
import type { Logger } from '@cordisjs/logger'
import { Context, Service } from 'cordis'
import { Database } from 'minato'

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
        } else if (queries.length === 1) {
            return queries[0]
        } else {
            throw new Error('TODO')
            // return  this.createUser()
        }
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
            'chatluna_user_group_additional',
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
