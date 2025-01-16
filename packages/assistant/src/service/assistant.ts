import { Context, Service } from 'cordis'
import { Assistant, ChatLunaAssistant } from '@chatluna/assistant'
import {
    ChatLunaConversation,
    ChatLunaAssistant as ChatLunaAssistantData
} from '@chatluna/memory/types'
import {} from '@chatluna/memory/service'
import { DataBaseChatMessageHistory } from '@chatluna/memory/memory'

export class ChatLunaAssistantService extends Service {
    private _assistants: Record<string, Assistant> = {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(ctx: Context, config: any) {
        super(ctx, 'chatluna_assistant', true)
    }

    async getAssistantData(
        conversation: ChatLunaConversation | string
    ): Promise<ChatLunaAssistantData> {
        const conversationData =
            typeof conversation === 'string'
                ? await this.ctx.chatluna_conversation.resolveConversation(
                      conversation
                  )
                : conversation

        const assistantData = await this.ctx.chatluna_conversation.getAssistant(
            conversationData.assistantId
        )

        return assistantData
    }

    async getAssistantById(id: number) {
        const assistantData =
            await this.ctx.chatluna_conversation.getAssistant(id)
        return assistantData
    }

    async getAssistantByConversation(
        conversation: ChatLunaConversation | string
    ) {
        const conversationId =
            typeof conversation === 'string' ? conversation : conversation.id

        if (this._assistants[conversationId]) {
            return this._assistants[conversationId]
        }

        const assistantData = await this.getAssistantData(conversation)

        const preset = () =>
            this.ctx.chatluna_preset.getPreset(assistantData.preset)

        const assistant = new ChatLunaAssistant({
            ctx: this.ctx,
            preset,
            model: assistantData.model,
            memory: new DataBaseChatMessageHistory(
                this.ctx,
                conversationId
                // TODO: maxMessageCount
            )
        })

        this._assistants[conversationId] = assistant

        return assistant
    }

    async clearAssistantCache(conversation: ChatLunaConversation | string) {
        const conversationId =
            typeof conversation === 'string' ? conversation : conversation.id

        // TODO: trgigger clear cache event

        delete this._assistants[conversationId]
    }

    async clearAssistantChatHistory(
        conversation: ChatLunaConversation | string
    ) {
        const assistant = await this.getAssistantByConversation(conversation)
        await assistant.memory.clear()
        await this.clearAssistantCache(conversation)
    }
}
