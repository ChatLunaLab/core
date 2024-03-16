import {
    ChatLunaConversationService,
    ChatLunaUserService
} from '@chatluna/memory/service'
import { Context } from 'cordis'

/**
 *
 * load chatluna memory
 *
 * @param ctx parentContext
 */
export function apply(ctx: Context) {
    ctx.plugin(ChatLunaConversationService)
    ctx.plugin(ChatLunaUserService)
}
