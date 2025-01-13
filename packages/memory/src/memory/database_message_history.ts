import { BaseChatMessageHistory } from '@langchain/core/chat_history'
import {
    AIMessage,
    BaseMessage,
    BaseMessageFields,
    HumanMessage,
    SystemMessage
} from '@langchain/core/messages'
import { Context } from 'cordis'

export class DataBaseChatMessageHistory extends BaseChatMessageHistory {
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
        super()

        this.conversationId = conversationId
        this._ctx = ctx
        this._chatHistory = []
        this._additional_kwargs = {}
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
        return this._saveMessage(new HumanMessage(message))
    }

    addAIChatMessage(message: string): Promise<void> {
        return this._saveMessage(new AIMessage(message))
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

        return serializedChatHistory.map((item) => {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const kw_args = item.additional_kwargs /*  ?? '{}') */
            const content = /* JSON.parse( */ item.content /*  */
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fields: BaseMessageFields = {
                content,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                additional_kwargs: kw_args as any
            }
            if (item.role === 'system') {
                return new SystemMessage(fields)
            } else if (item.role === 'human') {
                return new HumanMessage(fields)
            } else if (item.role === 'ai') {
                return new AIMessage(fields)
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
                    role: message.getType(),
                    content: message.content,
                    additional_kwargs: message.additional_kwargs
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
