import { Context, Schema } from 'cordis'
import { ChatLunaAssistantService } from '@chatluna/assistant/service'

export * from './assistant/index.ts'

export function apply(ctx: Context) {
    ctx.plugin(ChatLunaAssistantService)
}

export const name = 'chatluna-assistant'

export const inject = [
    'chatluna_platform',
    'chatluna_conversation',
    'chatluna_user',
    'chatluna_preset',
    'cortex_luna',
    'database'
]

export interface Config {}

export const Config: Schema<Config> = Schema.object({})
