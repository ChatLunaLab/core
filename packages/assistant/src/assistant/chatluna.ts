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

    constructor(private _input: AssisantInput) {
        super(_input)
    }

    async _stream(args: ChatLunaLLMCallArg) {
        if (this._chain == null || this._input.assisantMode === 'plugin') {
            await this._createChain()
        }

        return this._chain.stream(args)
    }

    private _createModel() {
        let model: string

        if (this._input.model instanceof Array) {
            model = this._input.model.join('/')
        } else {
            model = this._input.model
        }

        return this.ctx.chatluna_platform.randomModel(model, ModelType.llm)
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
        let model: string

        if (this._input.model instanceof Array) {
            model = this._input.model.join('/')
        } else {
            model = this._input.model
        }

        return model
    }
}
