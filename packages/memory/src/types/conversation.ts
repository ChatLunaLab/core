import { PartialOptional } from '@chatluna/memory/types'
import { MessageContent, MessageType } from '@langchain/core/messages'

export interface ChatLunaMessage {
    id: string
    createdTime: Date
    content: MessageContent
    role: ChatLunaMessageRole
    conversationId: string
    name?: string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additional_kwargs?: Record<string, any>

    parentId?: string
}

export interface ChatLunaConversation {
    id: string
    latestMessageId?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additional_kwargs?: Record<string, any>

    preset: string
    // platform model
    model: string
    chatMode: string

    createdTime: Date
    updatedTime: Date
}

export interface ChatLunaConversationAdditional {
    userId: string
    conversationId: string
    owner: boolean

    mute?: boolean
    private?: boolean
    // default true guildId; xx -> guildId xx this is default
    // default true guildId null -> private chat default
    default?: boolean
    guildId?: string
}

export type ChatLunaConversationTemplate = PartialOptional<
    ChatLunaConversation,
    | 'latestMessageId'
    | 'id'
    | 'additional_kwargs'
    | 'createdTime'
    | 'updatedTime'
>

export type ChatLunaMessageRole = MessageType

export interface ChatLunaTables {}

declare module '@chatluna/memory/types' {
    interface ChatLunaTables {
        chatluna_conversation: ChatLunaConversation
        chatluna_message: ChatLunaMessage
        chatluna_conversation_additional: ChatLunaConversationAdditional
    }
}
