import { Context } from 'cordis'
import { expect, should } from 'chai'
import { describe, it } from 'mocha'
import {
    formatPresetTemplate,
    formatPresetTemplateString
} from '../src/preset/utils'
import { PresetTemplate } from '../src/preset/types'
import {
    AIMessage,
    HumanMessage,
    SystemMessage
} from '@langchain/core/messages'
import { loadPreset, loadTxtPreset } from '../src/preset/load'
import {
    ChatLunaError,
    ChatLunaErrorCode,
    setErrorFormatTemplate
} from '../src/utils'

should()

describe('Error', () => {
    it('error with error code', async () => {
        expect(() => {
            throw new ChatLunaError(ChatLunaErrorCode.UNKNOWN_ERROR, '?')
        }).throw(
            '使用 ChatLuna 时出现错误，错误码为 999。请联系开发者以解决此问题。'
        )
    })

    it('error with custom error message', async () => {
        setErrorFormatTemplate(
            'Use ChatLuna when an error occurs, error code is %s. Please contact the developer to solve this problem.'
        )
        expect(() => {
            throw new ChatLunaError(
                ChatLunaErrorCode.UNKNOWN_ERROR,
                'Custom Error'
            )
        }).throw(
            'Use ChatLuna when an error occurs, error code is 999. Please contact the developer to solve this problem.'
        )

        setErrorFormatTemplate(null)
    })

    it('error with origin error', async () => {
        const originError = new Error('origin error')
        expect(
            new ChatLunaError(ChatLunaErrorCode.UNKNOWN_ERROR, originError)
        ).to.be.property('stack', originError.stack)
    })
})
