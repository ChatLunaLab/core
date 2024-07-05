import { PlatformElement } from '@chatluna/chat/middleware'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'
import { ChatLunaSimpleMessage } from '@chatluna/memory/types'
import type { Logger } from '@cordisjs/logger'
import { Context, Service } from 'cordis'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatLunaMessageTransformService<T = any, R = any> extends Service {
    private _logger: Logger
    private _transformFunctions: Record<
        string,
        MessageTransformFunction<T, R>
    > = {}

    async transform(
        session: T,
        elements: PlatformElement<R>[],
        message: ChatLunaSimpleMessage = {
            content: '',
            role: 'human',
            additional_kwargs: {}
        },
        quoteMessage?: QuoteMessage<R>
    ): Promise<ChatLunaSimpleMessage> {
        for (const rawElement of elements) {
            const element = rawElement as {
                type: string
                props: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    [key: string]: any
                }
                children: PlatformElement<T>[]
            }
            const transformFunction = this._transformFunctions[element.type]
            if (transformFunction != null) {
                const result = await transformFunction(
                    session,
                    rawElement,
                    message
                )

                if (result === false && element.children) {
                    await this.transform(
                        session,
                        element.children as PlatformElement<R>[],
                        message
                    )
                }
            }
        }

        if (quoteMessage) {
            let quoteBuildedMessage: ChatLunaSimpleMessage
            try {
                quoteBuildedMessage = await this.transform(
                    session,
                    quoteMessage.elements,
                    {
                        content: '',
                        additional_kwargs: {},
                        role: 'human'
                    }
                )
            } catch (error) {
                console.error('Error transforming message:', error)
                // 根据实际情况处理错误，例如回退操作、记录日志或向用户反馈
                return // 或者返回一个错误提示等
            }

            // 验证返回的对象格式
            if (
                !quoteBuildedMessage ||
                typeof quoteBuildedMessage.content !== 'string' ||
                !Array.isArray(quoteBuildedMessage.additional_kwargs?.images)
            ) {
                console.error('Invalid format of quoteBuildedMessage')
                return
            }

            // merge images
            if (quoteBuildedMessage.content.length > 1) {
                // 优化字符串拼接
                const parts = [
                    `There is quote message: ${quoteBuildedMessage.content}.`,
                    'If the user ask about the quote message, please generate a response based on the quote message.',
                    message.content
                ]
                message.content = parts.join('\n')
            }

            if (
                quoteBuildedMessage.additional_kwargs.images &&
                quoteBuildedMessage.additional_kwargs.images.length > 0
            ) {
                // 优化数组合并逻辑
                message.additional_kwargs.images =
                    message.additional_kwargs.images || []
                message.additional_kwargs.images.push(
                    ...quoteBuildedMessage.additional_kwargs.images
                )
            }
        }

        return message
    }

    intercept(type: string, transformFunction: MessageTransformFunction) {
        if (type === 'text' && this._transformFunctions['text'] != null) {
            throw new ChatLunaError(
                ChatLunaErrorCode.UNKNOWN_ERROR,
                new Error('text transform function already exists')
            )
        }

        if (
            this._transformFunctions[type] != null &&
            !['image'].includes(type)
        ) {
            this._logger?.warn(
                `transform function for ${type} already exists. Check your installed plugins.`
            )
        }

        this._transformFunctions[type] = transformFunction
    }

    constructor(ctx: Context) {
        super(ctx, 'chatluna_message_transform')
        this._logger = ctx.logger('chatluna_message_transform')
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MessageTransformFunction<T = any, R = any> = (
    session: T,
    element: PlatformElement<R>,
    message: ChatLunaSimpleMessage
) => Promise<boolean | void>

export interface QuoteMessage<R> {
    elements: PlatformElement<R>[]
}

declare module 'cordis' {
    interface Context {
        chatluna_message_transform: ChatLunaMessageTransformService
    }
}
