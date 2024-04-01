import {
    ChatMiddlewareContext,
    ChatMiddlewareFunction,
    ChatMiddlewareGraph,
    ChatMiddlewareName
} from '@chatluna/chat/middleware'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatMiddleware<T = any, R = any> {
    constructor(
        public graph: ChatMiddlewareGraph<T, R>,
        public name: keyof ChatMiddlewareName,
        public func: ChatMiddlewareFunction<T, R>
    ) {}

    execute(session: T, ctx: ChatMiddlewareContext<T, R>) {
        return this.func(session, ctx)
    }

    before<K extends keyof ChatMiddlewareName>(name: K) {
        this.graph.before(this.name, name)
    }

    after<K extends keyof ChatMiddlewareName>(name: K) {
        this.graph.after(this.name, name)
    }
}
