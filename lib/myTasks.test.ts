import { describe, expect, it } from "vitest"
import { groupMyTasks, myTaskGroup, myTaskHref, myTasksBadge, todayTasks, localDayISO, type MyTask } from "./myTasks"

const t = (over: Partial<MyTask>): MyTask => ({ docId: "room1", rowId: "r", roomTitle: "Room", title: "T", status: "Todo", priority: "Med", due: "", roles: ["assignee"], ...over })
// 2026-11-18 is a Wednesday; its week ends Sunday 2026-11-22.
const today = "2026-11-18"

describe("myTasks", () => {
  it("groups by due date", () => {
    expect(myTaskGroup("2026-11-17", today)).toBe("Overdue")
    expect(myTaskGroup(today, today)).toBe("Today")
    expect(myTaskGroup("2026-11-22", today)).toBe("This week")
    expect(myTaskGroup("2026-11-23", today)).toBe("Later")
    expect(myTaskGroup("", today)).toBe("No date")
  })

  it("filters by role tab and orders groups and tasks", () => {
    const tasks = [
      t({ rowId: "later", due: "2026-12-01" }),
      t({ rowId: "b-over", title: "B", due: "2026-11-01" }),
      t({ rowId: "a-over", title: "A", due: "2026-11-01" }),
      t({ rowId: "nodate" }),
      t({ rowId: "owned", roles: ["owner"], due: today }),
    ]
    const g = groupMyTasks(tasks, "assignee", today)
    expect(g.map((x) => x.group)).toEqual(["Overdue", "Later", "No date"])
    expect(g[0].tasks.map((x) => x.rowId)).toEqual(["a-over", "b-over"])
    expect(groupMyTasks(tasks, "owner", today)).toEqual([{ group: "Today", tasks: [tasks[4]] }])
    expect(groupMyTasks(tasks, "creator", today)).toEqual([])
  })

  it("badge and Today card count open tasks on me due today or earlier", () => {
    const tasks = [
      t({ rowId: "1", due: "2026-11-01" }),
      t({ rowId: "2", due: today, roles: ["owner"] }),
      t({ rowId: "3", due: today, roles: ["follower"] }),
      t({ rowId: "4", due: "2026-11-19" }),
      t({ rowId: "5", due: "2026-11-02", status: "Done" }),
    ]
    expect(myTasksBadge(tasks, today)).toBe(2)
    expect(todayTasks(tasks, today).map((x) => x.rowId)).toEqual(["1", "2"])
    expect(todayTasks(Array.from({ length: 9 }, (_, i) => t({ rowId: String(i), due: today })), today)).toHaveLength(5)
  })

  it("links open the task drawer in its room", () => {
    expect(myTaskHref({ docId: "room 1", rowId: "a/b" })).toBe("/workspace/room%201?tab=tasks&task=a%2Fb")
  })

  it("local day is YYYY-MM-DD", () => {
    expect(localDayISO(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})
