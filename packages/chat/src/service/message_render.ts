import { PlatformElement } from '@chatluna/chat/middleware'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/core/utils'
import { ChatLunaSimpleMessage } from '@chatluna/memory/types'
import { Context, Service } from 'cordis'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ChatLunaMessageRenderService<T = any> extends Service {
    private _renders: Record<string, ChatLunaMessageRender<T>>

    private _defaultOptions: ChatLunaMessageRenderOptions

    constructor(ctx: Context) {
        super(ctx, 'chatluna_message_render')
        this._defaultOptions = {
            type: 'raw'
        }
        this.updateRender(
            'raw',
            new ChatLunaRawMessageRender(
                ctx
            ) as unknown as ChatLunaMessageRender<T>
        )
    }

    // eslint-disable-next-line accessor-pairs
    set defaultOptions(options: ChatLunaMessageRenderOptions) {
        this._defaultOptions = options
    }

    public async render(
        message: ChatLunaSimpleMessage,
        options: ChatLunaMessageRenderOptions = this._defaultOptions
    ): Promise<ChatLunaRenderedMessage<T>> {
        try {
            const currentRenderer = this._renders[options.type]

            return await currentRenderer.render(message, options)
        } catch (e) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            throw new ChatLunaError(ChatLunaErrorCode.RENDER_ERROR, e as any)
        }
    }

    updateRender(
        type: MessageRenderType,
        render: ChatLunaMessageRender<T>
    ): ChatLunaMessageRender<T> {
        this._renders[type] = render
        return render
    }
}

export abstract class ChatLunaMessageRender<T> {
    constructor(protected readonly ctx: Context) {}

    abstract render(
        message: ChatLunaSimpleMessage,
        options: ChatLunaMessageRenderOptions
    ): Promise<ChatLunaRenderedMessage<T>>
}

export class ChatLunaRawMessageRender extends ChatLunaMessageRender<string> {
    async render(
        message: ChatLunaSimpleMessage,
        options: ChatLunaMessageRenderOptions
    ): Promise<ChatLunaRenderedMessage<string>> {
        return {
            element: message.content as string
        }
    }
}

/**
 * 渲染参数
 */
export interface ChatLunaMessageRenderOptions {
    // 如果type为voice，那么这个值不可为空
    voice?: {
        speakerId?: number
    }
    split?: boolean
    type: MessageRenderType
}

export type MessageRenderType = 'raw' | 'voice' | 'text' | 'image' | 'mixed'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ChatLunaRenderedMessage<T> {
    element: PlatformElement<T> | PlatformElement<T>[]
}
