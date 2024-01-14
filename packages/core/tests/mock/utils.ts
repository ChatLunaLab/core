import { Context } from 'cordis'
import { withResolver } from '../../src/utils'

export function waitServiceLoad(ctx: Context, deps: string[]) {
    const { promise, resolve } = withResolver()

    ctx.inject(deps, () => {
        resolve()
    })

    return promise
}
