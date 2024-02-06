import { Context, ForkScope, ScopeStatus } from '@cordisjs/core'
import { withResolver } from '@chatluna/core/utils'
import { cosine } from 'ml-distance/lib/similarities.js'

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
    timeout: number = 10
): Promise<ForkScope> {
    const { resolve, reject, promise } = withResolver<ForkScope>()

    let fork: ForkScope

    fork = ctx.plugin({
        apply: (pluginCtx) => {
            pluginCtx.on('ready', async () => {
                try {
                    await plugin(pluginCtx)
                } catch (e) {
                    reject(e)
                }

                setTimeout(() => {
                    fork.dispose()

                    resolve(fork)
                }, timeout)
            })
        },
        name: 'chatluna_fork',
        inject: ['chatluna_request', 'chatluna_platform', 'logger']
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

export function runAsync(t: () => Promise<void>) {
    t()
}
