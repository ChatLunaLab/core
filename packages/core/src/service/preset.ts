import { Context, Logger, Service } from 'cordis'
import { loadPreset, PresetTemplate } from '@chatluna/core/preset'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'

export class PresetService extends Service {
    private readonly _presets: PresetTemplate[] = []

    private _aborter: AbortController

    private _logger: Logger

    constructor(readonly ctx: Context) {
        super(ctx, 'chatluna_preset', true)

        this._logger = ctx.logger('chaatluna')

        ctx.on('dispose', () => {
            this._aborter?.abort()
        })
    }

    async loadPreset(content: string, path?: string) {
        try {
            const preset = loadPreset(content)

            preset.path = path || 'default'
            this._presets.push(preset)
        } catch (e) {
            this._logger.error(`error when load preset ${path}`, e)
        }
    }

    async getPreset(
        triggerKeyword: string,
        throwError: boolean = true
    ): Promise<PresetTemplate> {
        const preset = this._presets.find((preset) =>
            preset.triggerKeyword.includes(triggerKeyword)
        )

        if (preset) {
            return preset
        }

        if (throwError) {
            throw new ChatLunaError(
                ChatLunaErrorCode.PREST_NOT_FOUND,
                new Error(`No preset found for keyword ${triggerKeyword}`)
            )
        }

        return undefined
    }

    async getDefaultPreset(): Promise<PresetTemplate> {
        const preset = this._presets.find((preset) =>
            preset.triggerKeyword.includes('chatgpt')
        )

        if (preset) {
            // await this.cache.set('default-preset', 'chatgpt')
            return preset
        } else {
            throw new ChatLunaError(
                ChatLunaErrorCode.PREST_NOT_FOUND,
                new Error(`No preset found for keyword chatgpt`)
            )
        }

        // throw new Error("No default preset found")
    }

    async getAllPresetKeyWord(
        concatKeyword: boolean = true
    ): Promise<string[]> {
        return this._presets.map((preset) =>
            concatKeyword
                ? preset.triggerKeyword.join(', ')
                : preset.triggerKeyword[0]
        )
    }

    async getPresets(): Promise<PresetTemplate[]> {
        return this._presets
    }

    addPreset(preset: PresetTemplate) {
        this._presets.push(preset)
    }

    updatePreset(keyword: string, preset: PresetTemplate) {
        const index = this._presets.findIndex((preset) =>
            preset.triggerKeyword.includes(keyword)
        )
        if (index === -1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.PREST_NOT_FOUND,
                new Error(`No preset found for keyword ${keyword}`)
            )
        }
        this._presets[index] = preset
    }
}
