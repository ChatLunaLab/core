import {
    AIMessage,
    BaseMessage,
    BaseMessageFields,
    HumanMessage,
    SystemMessage
} from '@langchain/core/messages'
import { load } from 'js-yaml'
import {
    isRoleBook,
    isRoleBookConfig,
    PresetTemplate,
    RawPreset,
    RoleBookConfig
} from './types.ts'

export function loadPreset(rawText: string): PresetTemplate {
    return loadYamlPreset(rawText)
}

function createMessage(
    role: string,
    content: string,
    type?: string
): BaseMessage {
    if (content == null) {
        throw new Error('Content is required')
    }

    const fields: BaseMessageFields = {
        content: content.trim(),
        additional_kwargs: { type }
    }

    switch (role) {
        case 'assistant':
        case 'ai':
        case 'model':
            return new AIMessage(fields)
        case 'user':
        case 'human':
            return new HumanMessage(fields)
        case 'system':
            return new SystemMessage(fields)
        default:
            throw new Error(`Unknown role: ${role}`)
    }
}

function loadYamlPreset(rawText: string): PresetTemplate {
    const rawJson = load(rawText) as RawPreset

    let loreBooks: PresetTemplate['loreBooks'] | undefined = {
        items: []
    }

    let authorsNote: PresetTemplate['authorsNote'] | undefined

    if (rawJson.world_lores) {
        const config = rawJson.world_lores.find(
            isRoleBookConfig
        ) as RoleBookConfig

        const items = rawJson.world_lores.filter(isRoleBook).map((item) => ({
            ...item,
            keywords: Array.isArray(item.keywords)
                ? item.keywords
                : [item.keywords]
        }))

        loreBooks = {
            ...config,
            items
        }
    } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        loreBooks = undefined
    }

    if (rawJson.authors_note || rawJson['author_notes']) {
        authorsNote = rawJson.authors_note || rawJson['author_notes']
        authorsNote.insertFrequency = authorsNote.insertFrequency ?? 1
        authorsNote.insertPosition = authorsNote.insertPosition ?? 'in_chat'
        authorsNote.insertDepth = authorsNote.insertDepth ?? 0
    }

    return {
        triggerKeyword: rawJson.keywords,
        rawText,
        messages: rawJson.prompts.map((message) =>
            createMessage(message.role, message.content, message.type)
        ),
        formatUserPromptString: rawJson.format_user_prompt,
        loreBooks,
        authorsNote,
        knowledge: rawJson?.knowledge,
        version: rawJson?.version,
        config: rawJson.config ?? {}
    }
}
