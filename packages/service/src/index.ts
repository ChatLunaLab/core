import { ChatLunaService } from '@chatluna/service'
import { Context, Schema } from 'cordis'

/**
 *
 * load chatluna service
 *
 * @param ctx parentContext
 */
export function apply(ctx: Context, config?: Config) {
    ctx.plugin(ChatLunaService)
}

export const name = 'chatluna-service'

export const inject = ['chatluna_platform']

export interface Config {}

export const Config: Schema<Config> = Schema.object({})
export * from './service/index.ts'
