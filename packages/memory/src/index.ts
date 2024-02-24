import { Context } from '@cordisjs/core'
import { ChatLunaConversationService } from '@chatluna/memory/service'

/**
 *
 * load chatluna memory
 *
 * @param ctx parentContext
 */
export function apply(ctx: Context) {
    ctx.plugin(ChatLunaConversationService)
}
