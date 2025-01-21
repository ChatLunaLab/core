import { ChatLunaLLMCallArg } from '@chatluna/core/chain'
import { ChatLunaTool } from '@chatluna/core/platform'
import { PresetTemplate } from '@chatluna/core/preset'
import { getMessageContent } from '@chatluna/utils'
import { BaseChatMessageHistory } from '@langchain/core/chat_history'
import { BaseMessageChunk } from '@langchain/core/messages'
import { Context } from 'cordis'

export interface AssisantInput {
    ctx: Context
    model: () => Promise<[string, string] | string> | [string, string] | string
    assisantMode?: 'chat' | 'plugin' | string
    preset: () => Promise<PresetTemplate>
    memory: BaseChatMessageHistory
    tools?: ChatLunaTool[]
    conversationId?: string
    // files?: string[]
}

export abstract class Assistant {
    public ctx: Context
    public preset: () => Promise<PresetTemplate>
    public conversationId?: string

    private _chatCount = 0

    public memory: BaseChatMessageHistory

    constructor(input: AssisantInput) {
        this.ctx = input.ctx
        this.preset = input.preset
        this.memory = input.memory
    }

    async run(args: ChatLunaLLMCallArg): Promise<BaseMessageChunk> {
        /*  const additionalArgs = await this._chatHistory.getAdditionalArgs()
        arg.variables = { ...additionalArgs, ...arg.variables } */

        let response: BaseMessageChunk

        for await (const chunk of this.stream(args)) {
            response = response != null ? response.concat(chunk) : chunk
        }

        return response
    }

    async *stream(args: ChatLunaLLMCallArg) {
        await this.ctx.parallel(
            'chatluna/before-assistant-chat',
            args.message,
            args.variables,
            this
        )

        args.params = args.params ?? {}
        args.params['conversationId'] = this.conversationId

        let response: BaseMessageChunk
        for await (const chunk of await this._stream(args)) {
            yield chunk
            response = response != null ? response.concat(chunk) : chunk
        }

        this._afterChat(args, response)
    }

    private async _afterChat(
        args: ChatLunaLLMCallArg,
        response: BaseMessageChunk
    ): Promise<BaseMessageChunk> {
        this._chatCount++

        // Handle post-processing if needed
        /*   if (arg.postHandler) {
            const handlerResult = await this.handlePostProcessing(arg, response)
            response.message.content = handlerResult.displayContent
            await this._chatHistory.overrideAdditionalArgs(
                handlerResult.variables
            )
        } */

        const messageContent = getMessageContent(response.content)

        // Update chat history
        if (messageContent.trim().length > 0) {
            await this.memory.addMessage(args.message)
            await this.memory.addMessage(response)
        }

        // Process response
        this.ctx.parallel(
            'chatluna/after-assistant-chat',
            args.message,
            response,
            args.variables,
            this
        )

        return response
    }

    protected abstract _stream(
        args: ChatLunaLLMCallArg
    ): Promise<AsyncGenerator<BaseMessageChunk, void, unknown>>

    public abstract model: string
}
