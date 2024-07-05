export type Option<A, K extends keyof A> = Partial<Pick<A, K>> & Omit<A, K>
