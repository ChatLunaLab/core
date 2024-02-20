import { MessageContent, MessageType } from '@langchain/core/messages'

export interface ChatLunaMessage {
    content: MessageContent

    conversationId?: string

    role: ChatLunaMessageRole

    name?: string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additional_kwargs?: Record<string, any>

    parentId?: string

    id: string
}

export interface ChatLunaConversation {
    id: string
    latestMessageId?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additional_kwargs?: Record<string, any>

    preset: string
    model: string
    chatMode: string

    createdTime: number
    lastUpdatedTime: number
}

export interface ChatLunaUser {
    userId: string
    defaultConversationId?: string

    muteConversations: string[]
    ownerConversations: string[]
    joinedConversations: string[]

    excludeModels?: string[]
    userGroupId?: string[]

    balance?: number

    // userGroup or chat limit
    chatTimeLimitPerMin?: number
    lastChatTime?: number
}

export type ChatLunaMessageRole = MessageType
