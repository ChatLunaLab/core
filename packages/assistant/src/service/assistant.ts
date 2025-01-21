import { Context, Service } from 'cordis'
import { Assistant, ChatLunaAssistant } from '@chatluna/assistant'
import {
    ChatLunaConversation,
    ChatLunaAssistant as ChatLunaAssistantData
} from '@chatluna/memory/types'
import {} from '@chatluna/memory/service'
import { DataBaseChatMessageHistory } from '@chatluna/memory/memory'
import { LRUCache, sleep } from '@chatluna/utils'
import { ModelType } from '@chatluna/core/platform'

export class ChatLunaAssistantService extends Service {
    private _assistants = new LRUCache<Assistant>(100)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(ctx: Context, config: any) {
        super(ctx, 'chatluna_assistant', true)

        ctx.on('ready', async () => {
            await sleep(10000)
            try {
                await ctx.chatluna_conversation.getAssistantByName('Assistant')
            } catch {
                const models = this.ctx.chatluna_platform.getAllModels(
                    ModelType.llm
                )
                const randomModel =
                    models[Math.floor(Math.random() * models.length)]
                await ctx.chatluna_conversation.createAssistant({
                    name: 'Assistant',
                    shared: true,
                    ownId: 'admin',
                    model: `${randomModel.platform}/${randomModel.name}`,
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

        if (userId !== assistantData.ownId || !assistantData.shared) {
            return null
        }
        return assistantData
    }

    async deleteAssistant(userId: string, id: number) {
        const assistantData =
            await this.ctx.chatluna_conversation.getAssistant(id)

        if (userId !== assistantData.ownId || !assistantData.shared) {
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
                const assistantData = await this.getAssistantData(conversation)
                const conversationData =
                    typeof conversation === 'string'
                        ? await this.ctx.chatluna_conversation.resolveConversation(
                              conversation
                          )
                        : conversation

                return conversationData.model ?? assistantData.model
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
