export interface ChatMiddlewareName {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type h = string | any | any[]

export enum ChatMiddlewareRunStatus {
    SKIPPED = 0,
    STOP = 1,
    CONTINUE = 2
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatMiddlewareFunction<T = any> = (
    session: T,
    context: ChatMiddlewareContext<T>
) => Promise<string | h[] | h[][] | ChatMiddlewareRunStatus | undefined>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ChatMiddlewareContext<T = any> {
    session: T
    message: string | h[] | h[][]
    options?: ChatMiddlewareContextOptions
    command?: string
    recallThinkingMessage?: () => Promise<void>
    send: (message: h[][] | h[] | h | string) => Promise<void>
}

export interface ChatMiddlewareContextOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
}
