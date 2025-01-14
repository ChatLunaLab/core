import { ChatLunaLLMCallArg } from '@chatluna/core/chain'
import { BaseChatMemory } from '@chatluna/core/memory'
import { ChatLunaTool } from '@chatluna/core/platform'
import { PresetTemplate } from '@chatluna/core/preset'
import { getMessageContent } from '@chatluna/utils'
import { BaseMessageChunk } from '@langchain/core/messages'
import { Context } from 'cordis'

export interface AssisantInput {
    ctx: Context
    model: [string, string] | string
    assisantMode?: 'chat' | 'plugin' | string
    preset: () => Promise<PresetTemplate>
    memory: BaseChatMemory
    tools?: ChatLunaTool[]
    // files?: string[]
}

export abstract class Assistant {
    public ctx: Context
    public preset: () => Promise<PresetTemplate>

    private _chatCount = 0

    private _memory: BaseChatMemory

    constructor(input: AssisantInput) {
        this.ctx = input.ctx
        this.preset = input.preset
        this._memory = input.memory
    }

    async run(args: ChatLunaLLMCallArg): Promise<BaseMessageChunk> {
        await this.ctx.parallel(
            'chatluna/before-assistant-chat',
            args.message,
            args.variables,
            this
        )

        /*  const additionalArgs = await this._chatHistory.getAdditionalArgs()
        arg.variables = { ...additionalArgs, ...arg.variables } */

        const response = await this._processChat(args)

        this.ctx.parallel(
            'chatluna/after-assistant-chat',
            args.message,
            response,
            args.variables,
            this
        )

        return response
    }

    private async _processChat(
        args: ChatLunaLLMCallArg
    ): Promise<BaseMessageChunk> {
        const response = await this._run(args)
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
            await this._memory.chatHistory.addMessage(args.message)
            await this._memory.chatHistory.addMessage(response)
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

    abstract _run(args: ChatLunaLLMCallArg): Promise<BaseMessageChunk>
}
