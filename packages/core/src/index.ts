import { Context } from 'cordis'
import { RequestService } from './service'

/**
 *
 * load chatluna root service
 *
 * @param ctx parentContext
 */
export function loadChatLunaCore(ctx: Context) {
    ctx.plugin(RequestService)
}
