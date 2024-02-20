import { Context } from '@cordisjs/core'
import { PlatformService, RequestService } from '@chatluna/core/service'

/**
 *
 * load chatluna root service
 *
 * @param ctx parentContext
 */
export function apply(ctx: Context) {
    ctx.plugin(RequestService)
    ctx.plugin(PlatformService)
}
