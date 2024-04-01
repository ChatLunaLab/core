import { ChatMiddlewareGraph } from '@chatluna/chat/middleware'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatMiddlewareExecutor<T = any, R = any> {
    constructor(public graph: ChatMiddlewareGraph<T, R>) {}
}
