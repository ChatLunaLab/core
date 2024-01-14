import { load } from 'js-yaml'
import { PresetTemplate, RawPreset } from './types'
import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage
} from '@langchain/core/messages'

export function loadPreset(rawText: string): PresetTemplate {
    if (!rawText.includes('prompts:') && !rawText.includes('keywords:')) {
        return loadTxtPreset(rawText)
    }

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
        formatUserPromptString: rawJson.format_user_prompt
    }
}

export function loadTxtPreset(rawText: string): PresetTemplate {
    const triggerKeyword: string[] = []
    const messages: BaseMessage[] = []

    // split like markdown paragraph
    // 傻逼CRLF
    const chunks = rawText
        // remove comment line (#)
        .replace(/#.*\r?\n/g, '')
        .replace(/\r\n/g, '\n')
        .split(/\n\n/)

    let formatUserPromptString = '{prompt}'

    for (const chunk of chunks) {
        // regex match [key]: [value]
        // the : can in value, but not in key
        const match = chunk.match(/^\s*([a-zA-Z_]+)\s*:\s*(.*)$/s)

        if (!match) {
            continue
        }

        const role = match[1].trim()
        const content = match[2]

        if (role === 'keyword') {
            triggerKeyword.push(
                ...content.split(',').map((keyword) => keyword.trim())
            )
        } else if (role === 'format_user_prompt') {
            formatUserPromptString = content.trim()
        } else if (role === 'assistant' || role === 'ai' || role === 'model') {
            messages.push(new AIMessage(content.trim()))
        } else if (role === 'user' || role === 'human') {
            messages.push(new HumanMessage(content.trim()))
        } else if (role === 'system') {
            messages.push(new SystemMessage(content.trim()))
        } else {
            throw new Error(`Unknown role: ${role}`)
        }
    }

    if (triggerKeyword.length === 0) {
        throw new Error('No trigger keyword found')
    }

    if (messages.length === 0) {
        throw new Error('No preset messages found')
    }

    return {
        rawText,
        triggerKeyword,
        messages,
        formatUserPromptString
    }
}
