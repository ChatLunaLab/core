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
    name?: string
    latestMessageId?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additional_kwargs?: Record<string, any>

    agent: string
    // platform model
    model: string

    createdTime: Date
    updatedTime: Date
}

export interface ChatLunaConversationAdditional {
    userId: string
    conversationId: string
    owner: boolean

    agent?: string
}

export interface ChatLunaConversationFilter {
    // 是否为 agent 默认的过滤器
    default_agent: boolean

    agent: string

    visibility: 'public_global' | 'private' | 'public'

    priority: number

    expressions?: string[]
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

declare module 'cordis' {
    interface Tables {
        chatluna_conversation: ChatLunaConversation
        chatluna_message: ChatLunaMessage
        chatluna_conversation_additional: ChatLunaConversationAdditional
    }
}
