import {
    AIMessageChunk,
    BaseMessage,
    BaseMessageChunk,
    ChatMessageChunk,
    FunctionMessageChunk,
    HumanMessageChunk,
    MessageType,
    SystemMessageChunk,
    ToolMessage,
    ToolMessageChunk
} from '@langchain/core/messages'
import {
    OpenAIMessageRole,
    OpenAIResponseMessage,
    OpenAITool
} from './types.ts'
import { StructuredTool } from '@langchain/core/tools'
import { zodToJsonSchema } from 'zod-to-json-schema'

export function messageTypeToOpenAIRole(type: MessageType): OpenAIMessageRole {
    switch (type) {
        case 'system':
            return 'system'
        case 'ai':
            return 'assistant'
        case 'human':
            return 'user'
        case 'function':
            return 'function'
        case 'tool':
            return 'tool'
        default:
            throw new Error(`Unknown message type: ${type}`)
    }
}

export function langchainMessageToOpenAIMessage(
    messages: BaseMessage[],
    model?: string
): OpenAIResponseMessage[] {
    const result: OpenAIResponseMessage[] = []

    for (const rawMessage of messages) {
        const role = messageTypeToOpenAIRole(rawMessage._getType())

        const msg = {
            content: (rawMessage.content as string) || null,
            name:
                role === 'assistant' || role === 'tool'
                    ? rawMessage.name
                    : undefined,
            role,
            //  function_call: rawMessage.additional_kwargs.function_call,
            tool_calls: rawMessage.additional_kwargs.tool_calls,
            tool_call_id: (rawMessage as ToolMessage).tool_call_id
        } as OpenAIResponseMessage

        if (msg.tool_calls == null) {
            delete msg.tool_calls
        }

        if (msg.tool_call_id == null) {
            delete msg.tool_call_id
        }

        if (msg.tool_calls) {
            for (const toolCall of msg.tool_calls) {
                const tool = toolCall.function

                if (!tool.arguments) {
                    continue
                }
                // Remove spaces, new line characters etc.
                tool.arguments = JSON.stringify(JSON.parse(tool.arguments))
            }
        }

        const images = rawMessage.additional_kwargs.images as string[] | null

        if (
            (model?.includes('vision') ||
                model?.startsWith('gpt-4o') ||
                model?.startsWith('claude-3') ||
                model?.includes('gemini-1.5')) &&
            images != null
        ) {
            msg.content = [
                {
                    type: 'text',
                    text: rawMessage.content as string
                }
            ]

            for (const image of images) {
                msg.content.push({
                    type: 'image_url',
                    image_url: {
                        url: image,
                        detail: 'low'
                    }
                })
            }
        }

        result.push(msg)
    }

    return result
}

export function formatToolsToOpenAITools(
    tools: StructuredTool[]
): OpenAITool[] {
    if (tools.length < 1) {
        return undefined
    }
    return tools.map(formatToolToOpenAITool)
}

export function formatToolToOpenAITool(tool: StructuredTool): OpenAITool {
    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            // any?
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            parameters: zodToJsonSchema(tool.schema as any)
        }
    }
}

export function convertOpenAIDeltaToMessageChunk(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delta: Record<string, any>,
    defaultRole?: OpenAIMessageRole
): BaseMessageChunk {
    const role = (
        (delta.role?.length ?? 0) > 0 ? delta.role : defaultRole
    ).toLowerCase()
    const content = delta.content ?? ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/naming-convention
    let additional_kwargs: { function_call?: any; tool_calls?: any }
    if (delta.function_call) {
        additional_kwargs = {
            function_call: delta.function_call
        }
    } else if (delta.tool_calls) {
        additional_kwargs = {
            tool_calls: delta.tool_calls
        }
    } else {
        additional_kwargs = {}
    }
    if (role === 'user') {
        return new HumanMessageChunk({ content })
    } else if (role === 'assistant') {
        const toolCallChunks = []
        if (Array.isArray(delta.tool_calls)) {
            for (const rawToolCall of delta.tool_calls) {
                toolCallChunks.push({
                    name: rawToolCall.function?.name,
                    args: rawToolCall.function?.arguments,
                    id: rawToolCall.id,
                    index: rawToolCall.index
                })
            }
        }
        return new AIMessageChunk({
            content,
            tool_call_chunks: toolCallChunks,
            additional_kwargs
        })
    } else if (role === 'system') {
        return new SystemMessageChunk({ content })
    } else if (role === 'function') {
        return new FunctionMessageChunk({
            content,
            additional_kwargs,
            name: delta.name
        })
    } else if (role === 'tool') {
        return new ToolMessageChunk({
            content,
            additional_kwargs,
            tool_call_id: delta.tool_call_id
        })
    } else {
        return new ChatMessageChunk({ content, role })
    }
}
