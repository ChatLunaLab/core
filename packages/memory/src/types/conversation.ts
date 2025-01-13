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
    userId?: string
}

export interface ChatLunaConversation {
    id: string
    title?: string
    latestMessageId?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additional_kwargs?: Record<string, any>

    assistant: string

    createdTime: Date
    updatedTime: Date
}

export interface ChatLunaConversationUser {
    userId: string
    conversationId: string
    assistant: string
}

export interface ChatLunaConversationGroup {
    guildId: string
    conversationId: string
    id: string
    name: string
    ownerId: string
    // true: public false: private
    visible: boolean
}

export interface ChatLunaAssistant {
    id: string
    name: string
    preset: string
    model: string
    description?: string
    avatar?: string
    tools?: {
        name: string
        enabled: boolean
        alwaysEnabled?: boolean
        triggerKeywords?: string[]
    }[]
    files?: string[]
}

export type ChatLunaAssistantTemplate = PartialOptional<ChatLunaAssistant, 'id'>

export interface ChatLunaConversationGroupUser {
    id: string
    userId: string
}

export type ChatLunaConversationTemplate = PartialOptional<
    ChatLunaConversation,
    | 'latestMessageId'
    | 'id'
    | 'additional_kwargs'
    | 'createdTime'
    | 'updatedTime'
    | 'title'
>

export type ChatLunaMessageRole = MessageType

declare module 'cordis' {
    interface Tables {
        chatluna_conversation: ChatLunaConversation
        chatluna_conversation_group: ChatLunaConversationGroup
        chatluna_message: ChatLunaMessage
        chatluna_conversation_user: ChatLunaConversationUser
        chatluna_assistant: ChatLunaAssistant
    }
}
