import { ChainEvents } from '@chatluna/core/chain'
import { VectorStoreRetrieverMemory } from '@chatluna/core/memory'
import { PlatformService } from '@chatluna/core/service'
import { RequestQueue } from '@chatluna/utils'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { Context } from 'cordis'
import { ChatLunaConversation } from '@chatluna/memory/types'
import { ChatInterface, ChatInterfaceInput } from '@chatluna/chat/chat'
import { parseRawModelName } from '@chatluna/core/utils'

type ChatLunaChatBridgerInfo = {
    chatInterface: ChatInterface
    room: ChatLunaConversation
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class ChatInterfaceWrapper {
    private _conversations: Record<string, ChatLunaChatBridgerInfo> = {}

    private _modelQueue = new RequestQueue()
    private _conversationQueue = new RequestQueue()
    private _platformService: PlatformService

    constructor(
        private _ctx: Context,
        private _input: ChatInterfaceInput
    ) {
        this._platformService = this._ctx.chatluna_platform
    }

    async chat(
        room: ChatLunaConversation,
        message: HumanMessage,
        event: ChainEvents,
        stream: boolean,
        signal?: AbortSignal,
        chatMemory?: VectorStoreRetrieverMemory,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params?: Record<string, any>
    ): Promise<AIMessage> {
        const { id: conversationId, model: fullModelName } = room

        const [platform] = parseRawModelName(fullModelName)

        const config = this._platformService.getConfigs(platform)[0]

        const requestId = crypto.randomUUID()

        const maxQueueLength = config.concurrentMaxSize
        const currentQueueLength =
            await this._modelQueue.getQueueLength(platform)

        await this._conversationQueue.add(conversationId, requestId, signal)
        await this._modelQueue.add(platform, requestId, signal)

        await event['llm-queue-waiting'](currentQueueLength)

        await this._modelQueue.wait(platform, requestId, maxQueueLength)

        try {
            const { chatInterface } =
                this._conversations[conversationId] ??
                (await this._createChatInterface(room))

            const humanMessage = new HumanMessage({
                content: message.content,
                name: message.name,
                additional_kwargs: message.additional_kwargs
            })

            const chainValues = await chatInterface.chat({
                message: humanMessage,
                events: event,
                stream,
                signal,
                chatMemory,
                params
            })

            return chainValues.message as AIMessage
        } finally {
            await this._modelQueue.remove(platform, requestId)
            await this._conversationQueue.remove(conversationId, requestId)
        }
    }

    async query(conversation: ChatLunaConversation): Promise<ChatInterface> {
        const { id } = conversation

        const { chatInterface } =
            this._conversations[id] ??
            (await this._createChatInterface(conversation))

        return chatInterface
    }

    async clearChatHistory(conversation: ChatLunaConversation) {
        const { id: conversationId } = conversation

        const chatInterface = await this.query(conversation)

        if (chatInterface == null) {
            return
        }

        // uuid
        const requestId = crypto.randomUUID()
        await this._conversationQueue.wait(conversationId, requestId, 0)
        await chatInterface.clearChatHistory()
        delete this._conversations[conversationId]
        await this._conversationQueue.remove(conversationId, requestId)
    }

    async clearCache(room: ChatLunaConversation | string) {
        let conversationId: string

        if (typeof room === 'string') {
            conversationId = room
        } else {
            conversationId = room.id
        }

        const requestId = crypto.randomUUID()
        await this._conversationQueue.wait(conversationId, requestId, 0)

        delete this._conversations[conversationId]

        await this._conversationQueue.remove(conversationId, requestId)
    }

    getCacheConversations() {
        return Object.keys(this._conversations).map(
            (conversationId) =>
                [conversationId, this._conversations[conversationId]] as [
                    string,
                    ChatLunaChatBridgerInfo
                ]
        )
    }

    async delete(room: ChatLunaConversation) {
        const { id: conversationId } = room

        const chatInterface = await this.query(room)

        if (chatInterface == null) {
            return
        }

        const requestId = crypto.randomUUID()
        await this._conversationQueue.wait(conversationId, requestId, 1)
        await chatInterface.delete(this._ctx, room)
        await this._conversationQueue.remove(conversationId, requestId)
        await this.clearCache(room)
    }

    dispose() {
        this._conversations = {}
    }

    private async _createChatInterface(
        room: ChatLunaConversation
    ): Promise<ChatLunaChatBridgerInfo> {
        const chatInterface = new ChatInterface(this._ctx.root, this._input)

        const result = {
            chatInterface,
            room
        }

        this._conversations[room.id] = result

        return result
    }
}
