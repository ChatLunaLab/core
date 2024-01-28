import { expect, should } from 'chai'
import { describe, it } from 'mocha'
import {
    formatPresetTemplate,
    formatPresetTemplateString,
    loadPreset
} from '@chatluna/core/src/preset'
import { PresetTemplate } from '../src/preset/types'
import {
    AIMessage,
    HumanMessage,
    SystemMessage
} from '@langchain/core/messages'

should()

describe('Format Preset', () => {
    it('should format string', async () => {
        const string1 = 'test {format} to {format2}'

        expect(
            formatPresetTemplateString(string1, {
                format: 'one',
                format2: 'two'
            })
        ).to.equal('test one to two')
    })

    it('should format preset object', async () => {
        const object1: PresetTemplate = {
            triggerKeyword: [],
            rawText: 'test {format} to {format2}',

            messages: [new SystemMessage('test {format} to {format2}')],

            formatUserPromptString: '',
            path: ''
        }

        const result = formatPresetTemplate(object1, {
            format: 'one',
            format2: 'two'
        })

        expect(result[0])
            .to.have.property('content')
            .that.equals('test one to two')
    })
})

describe('Load Preset', () => {
    it('should load yaml preset', async () => {
        const rawText = `
keywords:
    - test
    - test1

prompts:
    - role: system
      content: 'test。'

    - role: assistant
      content: test1

    - role: user
      content: test2

format_user_prompt: test123
        `

        const preset = loadPreset(rawText)

        const value = expect(preset)

        value.to.have
            .property('triggerKeyword')
            .that.deep.equals(['test', 'test1'])

        preset.should.have
            .property('messages')
            .that.deep.equals([
                new SystemMessage('test。'),
                new AIMessage('test1'),
                new HumanMessage('test2')
            ])
    })

    it('should load yaml preset with error', async () => {
        let rawText = `
prompts:
  - content: 'test。'
    role: 'system'
  - content: 'test1'
    role: 'assistant'
  - content: 'test2'
    role: 'user'
`

        expect(() => loadPreset(rawText)).throw(
            'Unknown keywords in preset: undefined, check you preset file'
        )

        rawText = `
        # keywords
        keywords:
            - test
            - test2
`

        expect(() => loadPreset(rawText)).throw(
            'Unknown prompts in preset: undefined, check you preset file'
        )

        rawText = `
keywords:
    - test
    - test1

prompts:
    - role: system
      content: 'test。'

    - role: assistant
      content: test1

    - role: useraa
      content: test2

format_user_prompt: test123`

        expect(() => loadPreset(rawText)).throw('Unknown role: useraa')
    })
})
