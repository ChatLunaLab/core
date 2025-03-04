import { Context, Service } from 'cordis'
import { Assistant, ChatLunaAssistant } from '@chatluna/assistant'
import {
    ChatLunaConversation,
    ChatLunaAssistant as ChatLunaAssistantData
} from '@chatluna/memory/types'
import {} from '@chatluna/memory/service'
import { DataBaseChatMessageHistory } from '@chatluna/memory/memory'
import { ChatLunaError, ChatLunaErrorCode, LRUCache } from '@chatluna/utils'
import { ModelType } from 'cortexluna'
import type {} from '@chatluna/core/service'

export class ChatLunaAssistantService extends Service {
    private _assistants = new LRUCache<Assistant>(100)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(ctx: Context, config: any) {
        super(ctx, 'chatluna_assistant', true)

        ctx.on('ready', async () => {
            try {
                await ctx.chatluna_conversation.getAssistantByName('Assistant')
            } catch {
                await ctx.chatluna_conversation.createAssistant({
                    name: 'Assistant',
                    shared: true,
                    author: 'ChatLuna Official',
                    ownerId: 'admin',
                    model: `auto:auto`,
                    description: 'Your assistant',
                    preset: 'empty',
                    avatar: 'https://avatars.githubusercontent.com/u/139454032?s=200&v=4'
                })
            }
        })
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

    async getAssistantById(userId: string, id: number) {
        const assistantData =
            await this.ctx.chatluna_conversation.getAssistant(id)

        if (userId !== assistantData.ownerId || !assistantData.shared) {
            return null
        }
        return assistantData
    }

    async deleteAssistant(userId: string, id: number) {
        const assistantData =
            await this.ctx.chatluna_conversation.getAssistant(id)

        if (userId !== assistantData.ownerId || !assistantData.shared) {
            return null
        }
        await this.ctx.chatluna_conversation.deleteAssistant(id)
    }

    async getAssistantByConversation(
        conversation: ChatLunaConversation | string
    ) {
        const conversationId =
            typeof conversation === 'string' ? conversation : conversation.id

        if (this._assistants.get(conversationId)) {
            return this._assistants[conversationId]
        }

        const assistantData = await this.getAssistantData(conversation)

        const preset = () =>
            this.ctx.chatluna_preset.getPreset(assistantData.preset)

        const assistant = new ChatLunaAssistant({
            ctx: this.ctx,
            preset,
            model: async () => {
                const conversationData =
                    typeof conversation === 'string'
                        ? await this.ctx.chatluna_conversation.resolveConversation(
                              conversation
                          )
                        : conversation

                let model = conversationData.model ?? assistantData.model

                if (model === 'auto:auto') {
                    const assistantData =
                        await this.getAssistantData(conversation)

                    const models = await this.ctx.cortex_luna
                        .models()
                        .then((models) =>
                            models.filter(
                                (model) =>
                                    model.type === ModelType.LANGUAGE_MODEL
                            )
                        )

                    if (models.length === 0) {
                        throw new ChatLunaError(
                            ChatLunaErrorCode.MODEL_INIT_ERROR,
                            'No available model'
                        )
                    }

                    const randomModel =
                        models[Math.floor(Math.random() * models.length)]

                    model = `${randomModel.provider}:${randomModel.name}`

                    await this.ctx.chatluna_conversation.updateAssistant({
                        ...assistantData,
                        model
                    })

                    await this.ctx.chatluna_conversation.updateConversation(
                        conversationId,
                        {
                            model
                        }
                    )
                }

                return model
            },
            conversationId,
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

        this._assistants.delete(conversationId)
    }

    async clearAssistantChatHistory(
        conversation: ChatLunaConversation | string
    ) {
        const assistant = await this.getAssistantByConversation(conversation)
        await assistant.memory.clear()
        await this.clearAssistantCache(conversation)
    }
}
