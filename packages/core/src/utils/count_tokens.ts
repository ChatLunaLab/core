import { type TiktokenModel } from 'js-tiktoken/lite'
import { encodingForModel } from './tiktoken'
import { ChatLunaError, ChatLunaErrorCode } from './error'
import { Context } from 'cordis'

// https://www.npmjs.com/package/js-tiktoken

const tiktokenModels = [
    'text-davinci-003',
    'text-davinci-002',
    'text-davinci-001',
    'text-curie-001',
    'text-babbage-001',
    'text-ada-001',
    'davinci',
    'curie',
    'babbage',
    'ada',
    'code-davinci-002',
    'code-davinci-001',
    'code-cushman-002',
    'code-cushman-001',
    'davinci-codex',
    'cushman-codex',
    'gpt2',
    'gpt-3.5-turbo',
    'gpt-35-turbo',
    'gpt-3.5-turbo-0301',
    'gpt-3.5-turbo-0613',
    'gpt-3.5-turbo-1106',
    'gpt-3.5-turbo-16k',
    'gpt-3.5-turbo-16k-0613',
    'gpt-4',
    'gpt-4-0314',
    'gpt-4-0613',
    'gpt-4-32k',
    'gpt-4-32k-0314',
    'gpt-4-32k-0613',
    'gpt-4-1106-preview',
    'gpt-4-vision-preview'
]
export const getModelNameForTiktoken = (modelName: string): TiktokenModel => {
    if (
        modelName === 'gpt-4-1106-preview' ||
        modelName === 'gpt-4-vision-preview'
    ) {
        return 'gpt-4-1106-preview'
    }
    if (modelName === 'gpt-3.5-turbo-1106') {
        return 'gpt-3.5-turbo-16k'
    }

    if (modelName.startsWith('gpt-3.5-turbo-16k')) {
        return 'gpt-3.5-turbo-16k'
    }

    if (modelName.startsWith('gpt-3.5-turbo')) {
        return 'gpt-3.5-turbo'
    }

    if (modelName.startsWith('gpt-4-32k')) {
        return 'gpt-4-32k'
    }

    if (modelName.startsWith('gpt-4-')) {
        return 'gpt-4'
    }

    if (tiktokenModels.includes(modelName)) {
        return modelName as TiktokenModel
    }

    return 'gpt-3.5-turbo'
}

export const getEmbeddingContextSize = (modelName?: string): number => {
    switch (modelName) {
        case 'text-embedding-ada-002':
            return 8191
        default:
            return 2046
    }
}

export const getModelContextSize = (
    modelName: TiktokenModel | string
): number => {
    switch (getModelNameForTiktoken(modelName)) {
        case 'gpt-4-1106-preview':
            return 128000
        case 'gpt-3.5-turbo-16k':
            return 16384
        case 'gpt-3.5-turbo':
            return 4096
        case 'gpt-4-32k':
            return 32768
        case 'gpt-4':
            return 8192
        case 'text-davinci-003':
            return 4097
        case 'text-curie-001':
            return 2048
        case 'text-babbage-001':
            return 2048
        case 'text-ada-001':
            return 2048
        case 'code-davinci-002':
            return 8000
        case 'code-cushman-001':
            return 2048
        default:
            return 4097
    }
}

interface CalculateMaxTokenProps {
    prompt: string
    modelName: TiktokenModel
    ctx?: Context
    force?: boolean
}

export const calculateMaxTokens = async ({
    prompt,
    modelName,
    ctx,
    force
}: CalculateMaxTokenProps) => {
    // fallback to approximate calculation if tiktoken is not available
    let numTokens = Math.ceil(prompt.length / 2)

    try {
        numTokens = (await encodingForModel(modelName, { ctx, force })).encode(
            prompt
        ).length
    } catch (error) {}
    const maxTokens = getModelContextSize(modelName)

    return maxTokens - numTokens
}

export function parseRawModelName(modelName: string): [string, string] {
    if (modelName == null) {
        throw new ChatLunaError(
            ChatLunaErrorCode.MODEL_NOT_FOUND,
            `Can't find model name`
        )
    }
    const result = modelName.split(/(?<=^[^\/]+)\//)

    if (result.length !== 2) {
        throw new ChatLunaError(
            ChatLunaErrorCode.MODEL_NOT_FOUND,
            `Can't find model name ${result}`
        )
    }

    return result as [string, string]
}
