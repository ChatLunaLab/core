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

    assistantId: number
    model?: string

    createdTime: Date
    updatedTime: Date
}

export interface ChatLunaConversationUser {
    userId: string
    conversationId: string
    assistant: string
    owner: boolean
}

export interface ChatLunaConversationGroup {
    guildId: string
    conversationId: string
    id: string
    name: string
    ownerId: string
    // true: public false: private
    visible: boolean
    memberCount: number
}

export interface ChatLunaConversationGroupUser {
    userId: string
    guildId: string
    isAssistant: boolean
}

export interface ChatLunaAssistant {
    id: number
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

export type ChatLunaConversationTemplate = PartialOptional<
    ChatLunaConversation,
    | 'latestMessageId'
    | 'id'
    | 'additional_kwargs'
    | 'createdTime'
    | 'updatedTime'
    | 'title'
    | 'model'
>

export type ChatLunaMessageRole = MessageType

declare module 'cordis' {
    interface Tables {
        chatluna_conversation: ChatLunaConversation
        chatluna_conversation_group: ChatLunaConversationGroup
        chatluna_conversation_group_user: ChatLunaConversationGroupUser
        chatluna_message: ChatLunaMessage
        chatluna_conversation_user: ChatLunaConversationUser
        chatluna_assistant: ChatLunaAssistant
    }

    interface Events {
        'chatluna/conversation-updated': (
            conversation: ChatLunaConversation
        ) => Promise<void>
    }
}
