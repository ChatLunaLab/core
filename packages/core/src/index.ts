import { Context } from 'cordis'
import { PlatformService, RequestService } from '@chatluna/core/service'

/**
 *
 * load chatluna root service
 *
 * @param ctx parentContext
 */
export function loadChatLunaCore(ctx: Context) {
    ctx.plugin(RequestService)
    ctx.plugin(PlatformService)
}
