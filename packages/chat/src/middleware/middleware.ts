import {
    ChatMiddlewareContext,
    ChatMiddlewareFunction,
    ChatMiddlewareGraph,
    ChatMiddlewareName
} from '@chatluna/chat/middleware'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatMiddleware<T = any> {
    constructor(
        public graph: ChatMiddlewareGraph<T>,
        public name: keyof ChatMiddlewareName,
        public func: ChatMiddlewareFunction<T>
    ) {}

    execute(session: T, ctx: ChatMiddlewareContext<T>) {
        return this.func(session, ctx)
    }

    before<K extends keyof ChatMiddlewareName>(name: K) {
        this.graph.before(this.name, name)
    }

    after<K extends keyof ChatMiddlewareName>(name: K) {
        this.graph.after(this.name, name)
    }
}
