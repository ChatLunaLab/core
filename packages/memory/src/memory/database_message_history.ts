import { Context } from 'cordis'
import {
    AssistantMessageSchema,
    BaseChatMessageHistory,
    BaseMessage,
    SystemMessageSchema,
    UserMessageSchema
} from 'cortexluna'

export class DataBaseChatMessageHistory implements BaseChatMessageHistory {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    lc_namespace: string[] = ['llm-core', 'memory', 'message']

    /* c8 ignore next 3 */
    conversationId: string

    private _ctx: Context
    private _chatHistory: BaseMessage[]
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private _additional_kwargs: Record<string, string>

    constructor(
        ctx: Context,
        conversationId: string,
        private _maxMessagesCount: number = 100
    ) {
        this.conversationId = conversationId
        this._ctx = ctx
        this._chatHistory = []
        this._additional_kwargs = {}
    }

    async addMessages(messages: BaseMessage[]): Promise<void> {
        for (const message of messages) {
            await this._saveMessage(message)
        }
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    get additional_kwargs() {
        return this._additional_kwargs
    }

    async getMessages(): Promise<BaseMessage[]> {
        if (this._chatHistory.length < 1) {
            this._chatHistory = await this._loadMessages()
        }

        return this._chatHistory
    }

    addUserMessage(message: string): Promise<void> {
        /* c8 ignore next 6 */
        return this._saveMessage({
            content: message,
            role: 'user'
        })
    }

    addAssistantChatMessage(message: string): Promise<void> {
        return this._saveMessage({
            content: message,
            role: 'assistant'
        })
    }

    async addMessage(message: BaseMessage): Promise<void> {
        await this._saveMessage(message)
    }

    async clear(): Promise<void> {
        await this._ctx.chatluna_conversation.clearMessages(this.conversationId)
        this._chatHistory = []
    }

    async delete(): Promise<void> {
        await this._ctx.chatluna_conversation.deleteConversation(
            this.conversationId
        )
    }

    async updateAdditionalKwargs(key: string, value: string): Promise<void> {
        await this.loadConversation()
        this._additional_kwargs = this._additional_kwargs ?? {}
        this._additional_kwargs[key] = value
        return await this._ctx.chatluna_conversation.updateConversationAdditional(
            this.conversationId,
            undefined,
            this._additional_kwargs
        )
    }

    async getAdditionalKwargs(key: string): Promise<string> {
        await this.loadConversation()

        return this._additional_kwargs?.[key]
    }

    async deleteAdditionalKwargs(key: string): Promise<void> {
        await this.loadConversation()

        delete this._additional_kwargs?.[key]
        await this._ctx.chatluna_conversation.updateConversationAdditional(
            this.conversationId,
            undefined,
            this._additional_kwargs
        )
    }

    async clearAdditionalKwargs(): Promise<void> {
        await this.loadConversation()
        this._additional_kwargs = undefined
        await this._ctx.chatluna_conversation.updateConversationAdditional(
            this.conversationId,
            undefined,
            this._additional_kwargs
        )
    }

    async overrideAdditionalKwargs(
        kwargs: Record<string, string>
    ): Promise<void> {
        /* c8 ignore next 12 */
        await this.loadConversation()
        this._additional_kwargs = this._additional_kwargs ?? {}
        this._additional_kwargs = Object.assign(this._additional_kwargs, kwargs)
        await this._ctx.chatluna_conversation.updateConversationAdditional(
            this.conversationId,
            this._additional_kwargs
        )
    }

    private async _loadMessages(): Promise<BaseMessage[]> {
        const serializedChatHistory =
            await this._ctx.chatluna_conversation.fetchAllMessages(
                this.conversationId
            )

        return serializedChatHistory.map((item): BaseMessage => {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const kw_args = item.additional_kwargs /*  ?? '{}') */
            const content = /* JSON.parse( */ item.content /*  */
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fields = {
                content,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                metadata: kw_args as any
            }
            if (item.role === 'system') {
                return SystemMessageSchema.parse({
                    role: 'system',
                    ...fields
                })
            } else if (item.role === 'user') {
                return UserMessageSchema.parse({
                    role: 'user',
                    ...fields
                })
            } else if (item.role === 'assistant') {
                return AssistantMessageSchema.parse({
                    role: 'assistant',
                    ...fields
                })
            } else {
                throw new Error('Unknown role')
            }
        })
    }

    private async _loadConversation() {
        const conversation =
            await this._ctx.chatluna_conversation.resolveConversation(
                this.conversationId
            )

        this._additional_kwargs = conversation.additional_kwargs

        if (!this._chatHistory || this._chatHistory.length < 1) {
            this._chatHistory = await this._loadMessages()
        }
    }

    async loadConversation() {
        if (!this._chatHistory || this._chatHistory.length < 1) {
            await this._loadConversation()
        }
    }

    private async _saveMessage(message: BaseMessage) {
        await this.loadConversation()

        const needCorpMessage =
            this._chatHistory.length >= this._maxMessagesCount

        const corpMessagesCount =
            await this._ctx.chatluna_conversation.addMessage(
                this.conversationId,
                {
                    role: message.role,
                    content: message.content,
                    additional_kwargs: message.metadata
                },
                needCorpMessage,
                this._maxMessagesCount
            )

        if (corpMessagesCount != null) {
            this._chatHistory.splice(0, corpMessagesCount)
        }

        this._chatHistory.push(message)
    }
}
