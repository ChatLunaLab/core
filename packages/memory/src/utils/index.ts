export function generateUUID() {
    return crypto.randomUUID()
}

export function dateWithDays(offsetDay: number, now: Date = new Date()) {
    now.setDate(now.getDate() + offsetDay)
    return now
}

export function startOfCurrentDay(now: Date = new Date()) {
    now.setHours(0)
    now.setMinutes(0)
    now.setSeconds(0)
    now.setMilliseconds(0)
    return now
}
