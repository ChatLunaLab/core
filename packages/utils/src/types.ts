export type Override<P, S> = Omit<P, keyof S> & S
export type Option<A, K extends keyof A> = Override<A, Partial<Pick<A, K>>>
export type Require<A, K extends keyof A> = Override<A, Required<Pick<A, K>>>
