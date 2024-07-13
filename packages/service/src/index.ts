import { ChatLunaService } from '@chatluna/service/service'
import { Context } from 'cordis'

/**
 *
 * load chatluna service
 *
 * @param ctx parentContext
 */
export function apply(ctx: Context) {
    ctx.plugin(ChatLunaService)
}
