import { ChatLunaConversationService } from './conversation.ts'
import { ChatLunaUserService } from './user.ts'

export * from './conversation.ts'
export * from './user.ts'

declare module 'cordis' {
    interface Context {
        chatluna_conversation: ChatLunaConversationService
        chatluna_user: ChatLunaUserService
    }
}
