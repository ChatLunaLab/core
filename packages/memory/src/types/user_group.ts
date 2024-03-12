export interface ChatLunaUserGroup {
    name: string

    id: number
    limitPerMin: number
    limitPerDay: number

    costPerToken: number

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
    chatTimeLimitPerMin?: Date
    lastChatTime?: Date
}

declare module '@chatluna/memory/types' {
    interface ChatLunaTables {
        chatluna_user_group: ChatLunaUserGroup
        chatluna_user: ChatLunaUser
        chatluna_user_additional: ChatLunaUserAdditional
    }
}
