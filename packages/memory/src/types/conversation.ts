import { PartialOptional } from '@chatluna/memory/types'
import { MessageContent, MessageType } from '@langchain/core/messages'

export interface ChatLunaSimpleMessage {
    content: MessageContent
    role: ChatLunaMessageRole
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additional_kwargs?: Record<string, any>
    name?: string
}

export interface ChatLunaMessage extends ChatLunaSimpleMessage {
    id: string
    createdTime: Date
    conversationId: string
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
