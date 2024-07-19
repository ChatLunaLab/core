import { BaseMessage } from '@langchain/core/messages'
import { PresetTemplate } from './types.ts'

export function formatPresetTemplate(
    presetTemplate: PresetTemplate,
    inputVariables: Record<string, string>
): BaseMessage[] {
    presetTemplate.messages.forEach((message) => {
        message.content = formatPresetTemplateString(
            message.content as string,
            inputVariables
        )
    })

    return presetTemplate.messages
}

export function formatPresetTemplateString(
    rawString: string,
    inputVariables: Record<string, string>
): string {
    // replace all {var} with inputVariables[var]
    return rawString.replace(/{(\w+)}/g, (_, varName) => {
        return inputVariables[varName] || `{${varName}}`
    })
}
