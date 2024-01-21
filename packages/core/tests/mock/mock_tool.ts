import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { StructuredTool, ToolParams } from '@langchain/core/tools'
import { z } from 'zod'

export interface MockToolParams<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends z.ZodObject<any, any, any, any> = z.ZodObject<any, any, any, any>
> extends ToolParams {
    name: string
    description: string
    schema: T
}

export class MockTool<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends z.ZodObject<any, any, any, any> = z.ZodObject<any, any, any, any>
> extends StructuredTool<T> {
    name: string

    description: string

    schema: T

    constructor(fields: MockToolParams<T>) {
        super(fields)
        this.name = fields.name
        this.description = fields.description
        this.schema = fields.schema
    }

    protected async _call(
        arg: z.output<T>,
        _runManager?: CallbackManagerForToolRun
    ): Promise<string> {
        return JSON.stringify(arg)
    }
}
