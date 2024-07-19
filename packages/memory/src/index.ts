import {
    ChatLunaConversationService,
    ChatLunaUserService
} from '@chatluna/memory/service'
import { Context, Schema } from 'cordis'

/**
 *
 * load chatluna memory
 *
 * @param ctx parentContext
 */
export function apply(ctx: Context, config?: Config) {
    ctx.plugin(ChatLunaConversationService)
    ctx.plugin(ChatLunaUserService)
}

export const name = 'chatluna-memory'

export const inject = ['chatluna_platform', 'database']

export interface Config {}

export const Config: Schema<Config> = Schema.object({})
