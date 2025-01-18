import { AssisantInput, Assistant } from '@chatluna/assistant'
import {
    ChatLunaChatChain,
    ChatLunaLLMCallArg,
    ChatLunaLLMChainWrapper
} from '@chatluna/core/chain'
import { ChatLunaChatModel } from '@chatluna/core/model'
import { ModelType } from '@chatluna/core/platform'

export class ChatLunaAssistant extends Assistant {
    private _chain: ChatLunaLLMChainWrapper

    private _model: ChatLunaChatModel

    private _rawModel: string

    constructor(private _input: AssisantInput) {
        super(_input)
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
                rawModel = rawModel[0] + '/' + rawModel[1]
            }

            this._rawModel = rawModel
        }

        return this.ctx.chatluna_platform.randomModel(this.model, ModelType.llm)
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
