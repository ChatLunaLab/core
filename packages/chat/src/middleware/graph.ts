import { ChatMiddleware } from './middleware.js'
import { ChatMiddlewareFunction, ChatMiddlewareName } from './types.js'

export class ChatMiddlewareGraph<T, R> {
    private tasks: ChatMiddleware<T, R>[] = []
    private edges: Map<string, string[]> = new Map()

    middleware(
        taskName: keyof ChatMiddlewareName,
        func: ChatMiddlewareFunction<T, R>
    ): void {
        const middleware = new ChatMiddleware(this, taskName, func)
        this.tasks.push(middleware)
        this.edges.set(taskName, [])
    }

    public before(taskName: string, beforeTaskName: string): void {
        this.edges.get(taskName)?.push(beforeTaskName)
    }

    public after(taskName: string, afterTaskName: string): void {
        this.edges.get(afterTaskName)?.push(taskName)
    }

    public build(): ChatMiddleware<T, R>[][] {
        const sortedTasks = this.topologicalSort()
        const taskGroups: ChatMiddleware<T, R>[][] = []

        // 使用一个映射来标记任务是否已经被分组
        const grouped = new Map<string, boolean>()
        this.tasks.forEach((task) => {
            grouped.set(task.name, false)
        })

        // 遍历排序后的任务列表，创建分组
        sortedTasks.forEach((taskName) => {
            if (!grouped.get(taskName)) {
                // 如果任务尚未分组，则创建新组
                const nextTasks = this.edges.get(taskName) || []
                const canRunInParallel =
                    nextTasks.filter((nextTask) => !grouped.get(nextTask))
                        .length > 1
                const group = [
                    this.tasks.find((task) => task.name === taskName)
                ]

                // 标记任务已经分组
                grouped.set(taskName, true)

                // 如果只有一个后续任务，它必须在当前任务后面执行
                if (!canRunInParallel) {
                    nextTasks.forEach((nextTaskName) => {
                        if (!grouped.get(nextTaskName)) {
                            const nextTask = this.tasks.find(
                                (task) => task.name === nextTaskName
                            )
                            if (nextTask) {
                                group.push(nextTask)
                                grouped.set(nextTaskName, true)
                            }
                        }
                    })
                }

                // 添加到任务组列表
                taskGroups.push(group as ChatMiddleware<T>[])
            }
        })

        return taskGroups
    }

    private topologicalSort(): string[] {
        const inDegree: Map<string, number> = new Map()
        const zeroInDegreeQueue: string[] = []
        const order: string[] = []

        this.tasks.forEach((task) => {
            inDegree.set(task.name, 0)
        })

        this.edges.forEach((edges) => {
            edges.forEach((edge) => {
                inDegree.set(edge, (inDegree.get(edge) || 0) + 1)
            })
        })

        inDegree.forEach((degree, taskName) => {
            if (degree === 0) {
                zeroInDegreeQueue.push(taskName)
            }
        })

        while (zeroInDegreeQueue.length) {
            const taskName = zeroInDegreeQueue.shift()!
            order.push(taskName)
            this.edges.get(taskName)?.forEach((edge) => {
                inDegree.set(edge, (inDegree.get(edge) || 0) - 1)
                if (inDegree.get(edge) === 0) {
                    zeroInDegreeQueue.push(edge)
                }
            })
        }

        if (order.length !== this.tasks.length) {
            throw new Error('The graph has at least one cycle')
        }

        return order
    }
}
