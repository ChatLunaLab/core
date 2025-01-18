import { Context, Logger, Service } from 'cordis'
import { loadPreset, PresetTemplate } from '@chatluna/core/preset'
import { ChatLunaError, ChatLunaErrorCode, sha1 } from '@chatluna/utils'

const isNode = typeof process !== 'undefined' && process.versions?.node

export class PresetService extends Service {
    private readonly _presets: PresetTemplate[] = []

    private _aborter: AbortController

    private _logger: Logger

    private _dir: string

    constructor(readonly ctx: Context) {
        super(ctx, 'chatluna_preset', true)

        this._logger = ctx.logger('chaatluna')

        ctx.on('dispose', () => {
            this._aborter?.abort()
        })

        this._presets.push({
            triggerKeyword: ['empty'],
            rawText: '',
            messages: [],
            config: {},
            path: 'empty'
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
            return preset
        } else {
            throw new ChatLunaError(
                ChatLunaErrorCode.PREST_NOT_FOUND,
                new Error(`No preset found for keyword chatgpt`)
            )
        }
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

    removePreset(path: string) {
        const index = this._presets.findIndex((preset) => preset.path === path)
        if (index === -1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.PREST_NOT_FOUND,
                new Error(`No preset found for path ${path}`)
            )
        }
        this._presets.splice(index, 1)
    }

    private async watchPreset(dir: string) {
        if (!isNode) {
            this._logger.warn(
                'File watching is only supported in Node.js environment.'
            )
            return
        }

        let fsWait: NodeJS.Timeout | boolean = false
        const md5Cache = new Map<string, string>()

        if (this._aborter != null) {
            this._aborter.abort()
        }

        this._aborter = new AbortController()

        const { watch } = await import('fs')
        const fs = await import('fs/promises')
        const path = await import('path')

        watch(
            dir,
            {
                signal: this._aborter.signal
            },
            async (event, filename) => {
                if (!filename) {
                    await this.loadAllPreset()
                    this.ctx.logger.debug(`trigger full reload preset`)
                    return
                }

                if (fsWait) return
                fsWait = setTimeout(() => {
                    fsWait = false
                }, 100)

                const filePath = path.join(this.dir, filename)

                try {
                    const fileStat = await fs.stat(filePath)
                    if (fileStat.isDirectory()) return

                    // Handle file deletion
                    if (event === 'rename' && !fileStat) {
                        const index = this._presets.findIndex(
                            (p) => p.path === filePath
                        )
                        if (index !== -1) {
                            this.removePreset(filePath)
                            this.ctx.logger.debug(`removed preset: ${filename}`)
                            return
                        }
                    }

                    // Check if file content changed
                    const md5Current = sha1(
                        (await fs.readFile(filePath)).toString('hex')
                    )
                    if (md5Current === md5Cache.get(filePath)) return
                    md5Cache.set(filePath, md5Current)

                    // Update or add the preset
                    const index = this._presets.findIndex(
                        (p) => p.path === filePath
                    )
                    if (index !== -1) {
                        // Update existing preset
                        const preset = loadPreset(
                            await fs.readFile(filePath, 'utf-8')
                        )
                        preset.path = filePath
                        this.updatePreset(preset.triggerKeyword[0], preset)
                        this.ctx.logger.debug(`updated preset: ${filename}`)
                    } else {
                        // Add new preset
                        await this.loadPreset(
                            await fs.readFile(filePath, 'utf-8'),
                            filePath
                        )
                        this.ctx.logger.debug(`added new preset: ${filename}`)
                    }
                } catch (e) {
                    this.ctx.logger.error(
                        `error when watching preset file ${filePath}`,
                        e
                    )

                    // trigger full reload
                    await this.loadAllPreset()
                }
            }
        )
    }

    async loadAllPreset() {
        if (!isNode) {
            this._logger.warn(
                'Loading presets from filesystem is only supported in Node.js environment.'
            )
            return
        }

        const fs = await import('fs/promises')
        const path = await import('path')

        const files = await fs.readdir(this.dir)

        this._presets.length = 0

        for (const file of files) {
            // use file
            const extension = path.extname(file)
            if (extension !== '.txt' && extension !== '.yml') {
                continue
            }
            const presetPath = path.join(this.dir, file)
            await this.loadPreset(
                await fs.readFile(presetPath, 'utf-8'),
                presetPath
            )
        }
    }

    async init(dir: string) {
        if (!isNode) {
            this._logger.warn(
                'Initialization with directory is only supported in Node.js environment.'
            )
            return
        }

        this._dir = dir
        await this.loadAllPreset()

        await this.watchPreset(dir)
    }

    get dir() {
        return this._dir
    }
}
