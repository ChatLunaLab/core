export interface ChatLunaUserGroup {
    name: string

    id: number
    limitPerMin: number
    limitPerDay: number

    costPerInputToken: number
    costPerOutputToken: number

    tokenPower: number

    supportModels: string[]
}

export interface ChatLunaUserAdditional {
    userId: string

    lastLimitPerMin: number

    lastLimitPerDay: number
}

export interface ChatLunaUser {
    userId: string

    excludeModels?: string[]
    userGroupId?: string[]

    balance?: number

    // userGroup or chat limit
    // global set
    chatTimeLimitPerMin?: number
    lastChatTime?: Date

    lastChatConversationId?: string
}

declare module 'cordis' {
    interface Tables {
        chatluna_user_group: ChatLunaUserGroup
        chatluna_user: ChatLunaUser
        chatluna_user_additional: ChatLunaUserAdditional
    }
}
