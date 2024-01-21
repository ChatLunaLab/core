import { expect, should } from 'chai'
import { describe, it } from 'mocha'
import {
    ChatLunaError,
    ChatLunaErrorCode,
    setErrorFormatTemplate,
    messageTypeToOpenAIRole,
    chunkArray
} from '@chatluna/core/src/utils'

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

describe('Other utils', () => {
    it('openai message type', async () => {
        messageTypeToOpenAIRole('system').should.eql('system')

        messageTypeToOpenAIRole('ai').should.eql('assistant')
        messageTypeToOpenAIRole('human').should.eql('user')
        messageTypeToOpenAIRole('function').should.eql('function')
        messageTypeToOpenAIRole('tool').should.eql('tool')

        expect(() => messageTypeToOpenAIRole('111' as 'human')).to.throw(
            'Unknown message type: 111'
        )
    })

    it('chunk array', async () => {
        const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

        chunkArray(array, 3).should.deep.equal([
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
            [10]
        ])
    })
})
