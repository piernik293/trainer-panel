import { allocateDaily } from "./dailyAllocationEngine"
import { buildPlanFeedback } from "./planFeedback"

const input = {
  days: [
    { dayIndex: 0, dayType: "push" },
    { dayIndex: 1, dayType: "pull" },
    { dayIndex: 2, dayType: "legs" },
    { dayIndex: 3, dayType: "push" },
    { dayIndex: 4, dayType: "pull" }
  ],
  weeklyTargets: {
    chest: 14,
    back: 16,
    legs: 18
  },
  constraints: {
    sessionMax: 14,
    sessionMin: 3
  }
}

const allocation = allocateDaily(input)
console.log(allocation)

const feedback = buildPlanFeedback(allocation, input)
console.log(feedback)
