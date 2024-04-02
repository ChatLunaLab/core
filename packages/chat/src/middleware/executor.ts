import { ChatMiddlewareGraph } from '@chatluna/chat/middleware'
import { Logger } from '@cordisjs/logger'
import { Context } from 'cordis'
import {
    ChatMiddlewareContext,
    ChatMiddlewareFunction,
    ChatMiddlewareName,
    PlatformElement
} from './types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatMiddlewareExecutor<T = any, R = any> {
    private _logger: Logger

    constructor(
        public ctx: Context,
        public graph: ChatMiddlewareGraph<T, R>
    ) {
        this._initLifecycleMiddleware()
        this._logger = this.ctx.logger('chatluna_middleware_executor')
    }

    middleware(
        taskName: keyof ChatMiddlewareName,
        func: ChatMiddlewareFunction<T, R>
    ) {
        return this.graph.middleware(taskName, func)
    }

    async execute(session: T, ctx: ChatMiddlewareContext<T, R>) {
        return this.graph.execute(session, ctx)
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

        type h = PlatformElement<R>

        for (const middleware of runList) {
            let result: ChatMiddlewareContext | h[] | h | h[][] | string

            let executedTime = Date.now()

            try {
                result = await middleware.execute(session, context)

                executedTime = Date.now() - executedTime
            } catch (error) {
                if (error instanceof ChatLunaError) {
                    await this.sendMessage(session, error.message)
                    return false
                }

                logger.error(`chat-chain: ${middleware.name} error ${error}`)

                logger.error(error)

                if (error.cause) {
                    logger.error(error.cause)
                }
                logger.debug('-'.repeat(20) + '\n')

                await this.sendMessage(
                    session,
                    `执行 ${middleware.name} 时出现错误: ${error.message}`
                )

                return false
            }

            if (
                !middleware.name.startsWith('lifecycle-') &&
                ChainMiddlewareRunStatus.SKIPPED !== result &&
                middleware.name !== 'allow_reply' &&
                executedTime > 10
            ) {
                logger.debug(
                    `middleware %c executed in %d ms`,
                    middleware.name,
                    executedTime
                )
                isOutputLog = true
            }

            if (result === ChainMiddlewareRunStatus.STOP) {
                // 中间件说这里不要继续执行了
                if (
                    context.message != null &&
                    context.message !== originMessage
                ) {
                    // 消息被修改了
                    await this.sendMessage(session, context.message)
                }

                if (isOutputLog) {
                    logger.debug('-'.repeat(20) + '\n')
                }

                return false
            } else if (result instanceof Array || typeof result === 'string') {
                context.message = result
            }
        }

        if (isOutputLog) {
            logger.debug('-'.repeat(20) + '\n')
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

        /*  for (const sender of this._senders) {
             await sender(session, messages)
         } */
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
            .middleware('lifecycle-handle_command', async (session, ctx) => 0)
            .before('lifecycle-request_model')
            .after('lifecycle-check')

        this.graph
            .middleware('lifecycle-request_model', async (session, ctx) => 0)
            .before('lifecycle-send')
            .after('lifecycle-send')

        this.graph
            .middleware('lifecycle-send', async (session, ctx) => 0)
            .after('lifecycle-request_model')
    }
}
