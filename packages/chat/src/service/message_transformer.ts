import { PlatformElement } from '@chatluna/chat/middleware'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/core/utils'
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
        }
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

declare module 'cordis' {
    interface Context {
        chatluna_message_transform: ChatLunaMessageTransformService
    }
}
