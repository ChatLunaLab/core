export * from './conversation.ts'
export * from './user_group.ts'

export type PartialRequired<T, K extends keyof T> = {
    [P in K]: Pick<T, K>[P]
} & {
    [P in Exclude<keyof T, K>]?: Partial<T>[P] | Omit<T, K>[P]
}

export type PartialOptional<T, K extends keyof T> = Omit<T, K> &
    Partial<Pick<T, K>>
