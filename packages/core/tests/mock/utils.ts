import { Context } from 'cordis'
import { withResolver } from '../../src/utils'

export function waitServiceLoad(ctx: Context, deps: string[]) {
    const { promise, resolve } = withResolver()

    ctx.inject(deps, () => {
        resolve()
    })

    return promise
}

export function loadPlugin(
    ctx: Context,
    plugin: (ctx: Context) => Promise<void>,
    timeout: number = 100
): Promise<void> {
    const { resolve, reject, promise } = withResolver<void>()

    const fork = ctx.plugin({
        apply: (pluginCtx) => {
            pluginCtx.on('ready', async () => {
                try {
                    await plugin(pluginCtx)
                } catch (e) {
                    reject(e)
                }

                setTimeout(() => {
                    fork.dispose()
                    resolve()
                }, timeout)
            })
        },
        inject: ['chatluna_request', 'chatluna_platform']
    })

    setTimeout(() => {
        fork.start()
    }, 1)

    return promise
}

export async function checkError(ctx: Context) {
    await ctx.lifecycle.flush()
    ctx.registry.forEach((scope) => {
        if (scope.error) throw scope.error
    })
}
