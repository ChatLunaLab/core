import {
    ChatLunaMessageRenderService,
    ChatLunaMessageTransformService
} from '@chatluna/chat/service'
import { Context, Schema } from 'cordis'

/**
 *
 * load chatluna chat
 *
 * @param ctx parentContext
 */
export function apply(ctx: Context, config?: Config) {
    ctx.plugin(ChatLunaMessageTransformService)
    ctx.plugin(ChatLunaMessageRenderService)
}

export const name = 'chatluna-chat'

export const inject = ['chatluna_platform']

export interface Config {}

export const Config: Schema<Config> = Schema.object({})
