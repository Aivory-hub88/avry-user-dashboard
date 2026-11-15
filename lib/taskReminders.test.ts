import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock("@/lib/db", () => ({ query: queryMock }))

import { localDayAndHour, nextDayISO, reminderTimeZone, runDueReminders } from "./taskReminders"

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] })
})
afterEach(() => {
  delete process.env.TASK_REMINDER_TZ
})

describe("task due reminders", () => {
  it("reads the day and hour in the reminder time zone", () => {
    // 2026-11-17 20:00 UTC = 2026-11-18 03:00 in Jakarta (UTC+7)
    expect(localDayAndHour(new Date("2026-11-17T20:00:00Z"), "Asia/Jakarta")).toEqual({ day: "2026-11-18", hour: 3 })
    expect(localDayAndHour(new Date("2026-11-17T20:00:00Z"), "UTC")).toEqual({ day: "2026-11-17", hour: 20 })
    expect(nextDayISO("2026-12-31")).toBe("2027-01-01")
  })

  it("falls back to Jakarta for an unknown zone", () => {
    process.env.TASK_REMINDER_TZ = "Mars/Olympus"
    expect(reminderTimeZone()).toBe("Asia/Jakarta")
    process.env.TASK_REMINDER_TZ = "Europe/Berlin"
    expect(reminderTimeZone()).toBe("Europe/Berlin")
  })

  it("waits for 08:00 local time unless forced", async () => {
    const early = new Date("2026-11-17T20:00:00Z") // 03:00 Jakarta
    expect(await runDueReminders(early)).toEqual({ skipped: "too-early" })
    expect(queryMock).not.toHaveBeenCalled()
    expect(await runDueReminders(early, { force: true })).toEqual({ day: "2026-11-18", sent: 2 })
  })

  it("sends for tomorrow and overdue tasks, deduped per day", async () => {
    const res = await runDueReminders(new Date("2026-11-18T02:00:00Z")) // 09:00 Jakarta
    expect(res).toEqual({ day: "2026-11-18", sent: 2 })
    const [sql, params] = queryMock.mock.calls[0]
    expect(params).toEqual(["2026-11-18", "2026-11-19"])
    expect(sql).toContain("INSERT INTO dashboard.workspace_task_reminders")
    expect(sql).toContain("ON CONFLICT DO NOTHING")
    expect(sql).toContain("t.status <> 'Done'")
    // Old dedupe rows are pruned in the same pass.
    expect(String(queryMock.mock.calls[1][0])).toContain("DELETE FROM dashboard.workspace_task_reminders")
  })
})
