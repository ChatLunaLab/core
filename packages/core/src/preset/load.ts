import { load } from 'js-yaml'
import { PresetTemplate, RawPreset } from './types.ts'
import {
    AIMessage,
    HumanMessage,
    SystemMessage
} from '@langchain/core/messages'

export function loadPreset(rawText: string): PresetTemplate {
    return loadYamlPreset(rawText)
}

function loadYamlPreset(rawText: string): PresetTemplate {
    const rawJson = load(rawText) as RawPreset

    if (rawJson.keywords == null) {
        throw new Error(
            `Unknown keywords in preset: ${rawJson.keywords}, check you preset file`
        )
    }

    if (rawJson.prompts == null) {
        throw new Error(
            `Unknown prompts in preset: ${rawJson.prompts}, check you preset file`
        )
    }

    const clonedOfJson = Object.assign({}, rawJson, {
        keywords: undefined,
        prompts: undefined,
        format_user_prompt: undefined
    })

    delete clonedOfJson.keywords
    delete clonedOfJson.prompts
    delete clonedOfJson.format_user_prompt

    return {
        triggerKeyword: rawJson.keywords,
        rawText,
        messages: rawJson.prompts.map((message) => {
            if (message.role === 'assistant') {
                return new AIMessage(message.content)
            } else if (message.role === 'user') {
                return new HumanMessage(message.content)
            } else if (message.role === 'system') {
                return new SystemMessage(message.content)
            } else {
                throw new Error(`Unknown role: ${message.role}`)
            }
        }),
        formatUserPromptString: rawJson.format_user_prompt,
        ...clonedOfJson
    }
}
