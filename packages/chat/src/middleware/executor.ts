import {
    ChatMiddlewareContext,
    ChatMiddlewareFunction,
    ChatMiddlewareGraph,
    ChatMiddlewareName,
    ChatMiddlewareRunStatus,
    PlatformElement
} from '@chatluna/chat/middleware'
import { ChatLunaError } from '@chatluna/utils'
import { Logger } from '@cordisjs/logger'
import { Context } from 'cordis'
import { ChatExecutorSender } from './types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatMiddlewareExecutor<T = any, R = any> {
    private _logger: Logger

    private _senders: ChatExecutorSender<T, R>[] = []

    constructor(
        public ctx: Context,
        public graph: ChatMiddlewareGraph<T, R>
    ) {
        this._initLifecycleMiddleware()
        this._logger = this.ctx.logger('chatluna')
    }

    middleware(
        taskName: keyof ChatMiddlewareName,
        func: ChatMiddlewareFunction<T, R>
    ) {
        return this.graph.middleware(taskName, func)
    }

    async receiveMessage(
        session: T,
        message: ChatMiddlewareContext['message'],
        ctx?: Context
    ) {
        const context: ChatMiddlewareContext = {
            message,
            ctx: ctx ?? this.ctx,
            session,
            options: {},
            send: (message) => this.sendMessage(session, message),
            recallThinkingMessage: async () => {}
        }

        context.recallThinkingMessage = context.recallThinkingMessage =
            this._createRecallThinkingMessage(context)

        const result = await this._runMiddleware(session, context)

        await context.recallThinkingMessage()

        return result
    }

    async receiveCommand(
        session: T,
        command: string,
        options: ChatMiddlewareContext['options'] = {}
    ) {
        const context: ChatMiddlewareContext = {
            message: options?.message,
            ctx: this.ctx,
            session,
            command,
            send: (message) => this.sendMessage(session, message),
            recallThinkingMessage: async () => {},
            options
        }

        context.recallThinkingMessage =
            this._createRecallThinkingMessage(context)

        const result = await this._runMiddleware(session, context)

        await context.recallThinkingMessage()

        return result
    }

    private _createRecallThinkingMessage(context: ChatMiddlewareContext<T, R>) {
        return async () => {
            if (context.options.thinkingTimeoutObject) {
                clearTimeout(context.options.thinkingTimeoutObject.timeout!)
                if (context.options.thinkingTimeoutObject.recallFunc) {
                    await context.options.thinkingTimeoutObject.recallFunc()
                }
                if (context.options?.thinkingTimeoutObject?.timeout) {
                    context.options.thinkingTimeoutObject.timeout = null
                }
                context.options.thinkingTimeoutObject = undefined
            }
        }
    }

    sender(sender: ChatExecutorSender<T, R>) {
        this._senders.push(sender)
    }

    private async _runMiddleware(
        session: T,
        context: ChatMiddlewareContext<T, R>
    ) {
        const originMessage = context.message

        const runList = this.graph.build()

        if (runList.length === 0) {
            return false
        }

        let isOutputLog = false

        type h = R

        for (const middleware of runList) {
            let result: ChatMiddlewareRunStatus | h[] | h | h[][] | string

            let executedTime = Date.now()

            try {
                result = await middleware.execute(session, context)

                executedTime = Date.now() - executedTime
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                if (error instanceof ChatLunaError) {
                    await this.sendMessage(session, error.message)
                    return false
                }

                this._logger.error(
                    `chat-chain: ${middleware.name} error ${error}`
                )

                this._logger.error(error)

                if (error.cause) {
                    this._logger.error(error.cause)
                }
                this._logger.debug('-'.repeat(20) + '\n')

                await this.sendMessage(
                    session,
                    `执行 ${middleware.name} 时出现错误: ${error.message}`
                )

                return false
            }

            if (
                !middleware.name.startsWith('lifecycle-') &&
                ChatMiddlewareRunStatus.SKIPPED !== result &&
                middleware.name.toString() !== 'allow_reply' &&
                executedTime > 10
            ) {
                this._logger.debug(
                    `middleware %c executed in %d ms`,
                    middleware.name,
                    executedTime
                )
                isOutputLog = true
            }

            if (result === ChatMiddlewareRunStatus.STOP) {
                // 中间件说这里不要继续执行了
                if (
                    context.message != null &&
                    context.message !== originMessage
                ) {
                    // 消息被修改了
                    await this.sendMessage(session, context.message)
                }

                if (isOutputLog) {
                    this._logger.debug('-'.repeat(20) + '\n')
                }

                return false
            } else if (result instanceof Array || typeof result === 'string') {
                context.message = result
            }
        }

        if (isOutputLog) {
            this._logger.debug('-'.repeat(20) + '\n')
        }

        if (context.message != null && context.message !== originMessage) {
            // 消息被修改了
            await this.sendMessage(session, context.message)
        }

        return true
    }

    private async sendMessage(
        session: T,
        message:
            | PlatformElement<R>[]
            | PlatformElement<R>[][]
            | PlatformElement<R>
            | string
    ) {
        // check if message is a two-dimensional array

        const messages: (PlatformElement<R>[] | PlatformElement<R> | string)[] =
            message instanceof Array ? message : [message]

        for (const sender of this._senders) {
            await sender(session, messages)
        }
    }

    private _initLifecycleMiddleware() {
        this.graph
            .middleware('lifecycle-prepare', async (session, ctx) => 0)
            .before('lifecycle-check')

        this.graph
            .middleware('lifecycle-check', async (session, ctx) => 0)
            .before('lifecycle-send')
            .after('lifecycle-prepare')

        this.graph
            .middleware('lifecycle-handle-command', async (session, ctx) => 0)
            .before('lifecycle-request-model')
            .after('lifecycle-check')

        this.graph
            .middleware('lifecycle-request-model', async (session, ctx) => 0)
            .before('lifecycle-send')
            .after('lifecycle-send')

        this.graph
            .middleware('lifecycle-send', async (session, ctx) => 0)
            .after('lifecycle-request-model')
    }
}
