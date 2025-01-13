import { Context } from 'cordis'

export interface ChatMiddlewareName {
    /**
     * lifecycle of the middleware execution, it mean the check chain can continue to execute if the middleware return true
     */
    'lifecycle-check': never
    /**
     * lifecycle of the middleware execution, it mean the middleware will be prepare some data for the next middleware
     */
    'lifecycle-prepare': never
    /**
     * lifecycle of the middleware execution, it mean the middleware will be request to the model
     */
    'lifecycle-request-model': never
    /**
     * lifecycle of the middleware execution, it mean the middleware will be send message
     */
    'lifecycle-send': never

    /**
     * lifecycle of the middleware execution, it mean the middleware will be handle command
     */
    'lifecycle-handle-command': never
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type h<T = any> = T

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PlatformElement<T> =
    | T
    | {
          type: string
          props: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              [key: string]: any
          }
          children: PlatformElement<T>[]
      }

export enum ChatMiddlewareRunStatus {
    SKIPPED = 0,
    STOP = 1,
    CONTINUE = 2
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatMiddlewareFunction<T = any, R = any> = (
    session: T,
    context: ChatMiddlewareContext<T>
) => Promise<string | h<R>[] | h<R>[][] | ChatMiddlewareRunStatus | undefined>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ChatMiddlewareContext<T = any, R = any> {
    session: T
    ctx: Context
    message: string | h<R>[] | h<R>[][]
    options?: ChatMiddlewareContextOptions
    command?: string
    recallThinkingMessage?: () => Promise<void>
    send: (message: h<R>[][] | h<R>[] | h<R> | string) => Promise<void>
}

export interface ChatMiddlewareContextOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
}

export type ChatExecutorSender<T, R> = (
    session: T,
    message: (PlatformElement<R>[] | PlatformElement<R> | string)[]
) => Promise<void>
