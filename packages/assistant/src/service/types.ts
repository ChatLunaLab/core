import { ChatLunaAssistantService } from '@chatluna/assistant/service'

declare module '@cordisjs/core' {
    interface Context {
        chatluna_assistant: ChatLunaAssistantService
    }
}
