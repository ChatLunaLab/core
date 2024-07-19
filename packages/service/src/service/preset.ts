import { Context, Service } from 'cordis'
import fs from 'fs/promises'
import path from 'path'
import { loadPreset, PresetTemplate } from '@chatluna/core/preset'
import { ChatLunaError, ChatLunaErrorCode } from '@chatluna/utils'

export class ChatLunaPresetService extends Service {
    private readonly _presets: PresetTemplate[] = []

    constructor(ctx: Context) {
        super(ctx, 'chatluna_preset')
    }

    async loadAllPreset() {
        await this._checkPresetDir()

        const presetDir = this.resolvePresetDir()
        const files = await fs.readdir(presetDir)

        this._presets.length = 0

        for (const file of files) {
            // use file
            const extension = path.extname(file)
            if (extension !== '.yml') {
                continue
            }
            const rawText = await fs.readFile(
                path.join(presetDir, file),
                'utf-8'
            )
            try {
                const preset = loadPreset(rawText)

                preset.path = path.join(presetDir, file)
                this._presets.push(preset)
            } catch (e) {
                throw new ChatLunaError(
                    ChatLunaErrorCode.PRESET_LOAD_ERROR,
                    e as Error
                )
            }
        }
    }

    async getPreset(
        triggerKeyword: string,
        loadForDisk: boolean = true,
        throwError: boolean = true
    ): Promise<PresetTemplate> {
        if (loadForDisk) {
            // always load for disk
            await this.loadAllPreset()
        }

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

    getDefaultPreset(): PresetTemplate {
        return {
            triggerKeyword: ['default'],
            rawText: '',
            messages: [],
            path: 'default.yml'
        }
    }

    async getAllPreset(concatKeyword: boolean = true): Promise<string[]> {
        await this.loadAllPreset()

        return this._presets.map((preset) =>
            concatKeyword
                ? preset.triggerKeyword.join(', ')
                : preset.triggerKeyword[0]
        )
    }

    public resolvePresetDir() {
        return path.resolve(this.ctx.baseDir, 'data/chatluna/presets')
    }

    private async _checkPresetDir() {
        const presetDir = path.join(this.resolvePresetDir())

        // check if preset dir exists
        try {
            await fs.access(presetDir)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                await fs.mkdir(presetDir, { recursive: true })
            } else {
                throw err
            }
        }
    }
}

declare module 'cordis' {
    interface Context {
        chatluna_preset: ChatLunaPresetService
    }
}
