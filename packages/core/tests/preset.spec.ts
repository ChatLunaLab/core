import { Context } from 'cordis'
import { expect } from 'chai'
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

describe('Format Preset', () => {
    it('should format a string', async () => {
        const string1 = 'test {format} to {format2}'

        expect(
            formatPresetTemplateString(string1, {
                format: 'one',
                format2: 'two'
            })
        ).to.equal('test one to two')
    })

    it('should format a preset object', async () => {
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
    it('should load a txt preset', async () => {
        const string1 = `
        # keywords
        keyword: test, test1

        # 这是系统设定的prompt，和之前在插件设置里的人格设定的那个配置是一样的。

        system: test。

        assistant: test1

        user: test2

        format_user_prompt: test123

        `

        const preset = loadTxtPreset(string1)

        const value = expect(preset)

        value.to.have
            .property('triggerKeyword')
            .that.deep.equals(['test', 'test1'])

        value.to.have.property('formatUserPromptString').that.equals('test123')

        value.to.have
            .property('messages')
            .that.deep.equals([
                new SystemMessage('test。'),
                new AIMessage('test1'),
                new HumanMessage('test2')
            ])
    })

    it('should load a yaml preset', async () => {
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

        value.to.have
            .property('messages')
            .that.deep.equals([
                new SystemMessage('test。'),
                new AIMessage('test1'),
                new HumanMessage('test2')
            ])
    })
})
