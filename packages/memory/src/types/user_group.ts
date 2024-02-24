export interface ChatLunaUserGroup {
    name: string

    id: number
    limitPerMin: number
    limitPerDay: number

    costPerToken: number

    supportModels: string[]
}

export interface ChatLunaUserGroupAdditional {
    userId: string

    lastLimitPerMin: number

    lastLimitPerDay: number
}

declare module '@chatluna/memory/types' {
    interface ChatLunaTables {
        chatluna_user_group: ChatLunaUserGroup
        chatluna_user_group_additional: ChatLunaUserGroupAdditional
    }
}
