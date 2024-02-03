import { Context } from 'cordis'
import { PlatformService, RequestService } from './service'

export * from './agents'
export * from './service'
export * from './chain'
export * from './utils'
export * from './platform'
export * from './model'
export * from './preset'
export * from './vectorstore'
export * from './memory'
export * from './retriever'

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
