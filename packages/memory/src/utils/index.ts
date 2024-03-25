export function generateUUID() {
    return crypto.randomUUID()
}

export function dateWithDays(offsetDay: number, now: Date = new Date()) {
    now = new Date(now)
    now.setDate(now.getDate() + offsetDay)
    return now
}

export function startOfCurrentDay(now: Date = new Date()) {
    now = new Date(now)
    now.setHours(0)
    now.setMinutes(0)
    now.setSeconds(0)
    now.setMilliseconds(0)
    return now
}
