export interface ChatLunaUserGroup {
    name: string

    id: number
    limitPerMin: number
    limitPerDay: number

    costPerToken: number

    supportModels: string[]
}

export interface ChatLunaJoinedUserGroup {
    userId: string

    lastLimitPerMin: number

    lastLimitPerDay: number
}
