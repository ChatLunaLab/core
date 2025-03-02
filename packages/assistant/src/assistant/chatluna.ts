import { AssisantInput, Assistant } from '@chatluna/assistant'
import {
    ChatLunaChatChain,
    ChatLunaLLMCallArg,
    ChatLunaLLMChainWrapper
} from '@chatluna/core/chain'
import { LanguageModel } from 'cortexluna'

export class ChatLunaAssistant extends Assistant {
    private _chain: ChatLunaLLMChainWrapper

    private _model: LanguageModel

    private _rawModel: string

    constructor(private _input: AssisantInput) {
        super(_input)

        this._input.ctx.on(
            'chatluna/conversation-updated',
            async (conversation) => {
                if (conversation.id === this.conversationId) {
                    this._chain = null
                    this._model = null
                    this._rawModel = null
                }
            }
        )
    }

    async _stream(args: ChatLunaLLMCallArg) {
        if (this._chain == null || this._input.assisantMode === 'plugin') {
            await this._createChain()
        }

        return this._chain.stream(args)
    }

    private async _createModel() {
        if (this._rawModel == null) {
            let rawModel = this._input.model()

            if (rawModel instanceof Promise) {
                rawModel = await rawModel
            }

            if (Array.isArray(rawModel)) {
                rawModel = rawModel[0] + ':' + rawModel[1]
            }

            this._rawModel = rawModel
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.ctx.cortex_luna.languageModel(this._rawModel as any)
    }

    private async _createChain() {
        if (this._model == null) {
            this._model = await this._createModel()
        }

        if (this._input.assisantMode === 'plugin') {
            // TODO
        }

        // chat mode

        const chain = ChatLunaChatChain.fromLLM(this._model, {
            historyMemory: this._input.memory,
            preset: this._input.preset,
            ctx: this.ctx
        })

        this._chain = chain
    }

    public get model() {
        return this._rawModel
    }
}
