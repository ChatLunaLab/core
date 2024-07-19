import { BaseMessage } from '@langchain/core/messages'

export interface PresetTemplate {
    triggerKeyword: string[]
    rawText: string
    messages: BaseMessage[]
    formatUserPromptString?: string
    path?: string
}

export interface RawPreset {
    keywords: string[]
    prompts: {
        role: 'user' | 'system' | 'assistant'
        content: string
    }[]
    format_user_prompt?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
}
