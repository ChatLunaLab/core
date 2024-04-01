import { ChatLunaMessageTransformService } from '@chatluna/chat/service'
import { Context } from 'cordis'

/**
 *
 * load chatluna chat
 *
 * @param ctx parentContext
 */
export function apply(ctx: Context) {
    ctx.plugin(ChatLunaMessageTransformService)
}
