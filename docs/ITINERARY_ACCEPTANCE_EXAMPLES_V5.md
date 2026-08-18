# India In Time — Generated Acceptance Examples

> Generated from the v5.1.0 authoritative planner using the same constraint-aware engine used by the application. These are deterministic acceptance fixtures, not claims about live venue conditions.

## 1. Morning

**USER REQUEST**

I have 5 hours in Vizag from 8 AM. I want scenic places and photography.

**REQUIREMENTS EXTRACTED**

```json
{
  "hard": {
    "startMin": 480,
    "endMin": 780,
    "durationMin": 300,
    "excludedCategories": [],
    "maxTravelMinutes": null,
    "maxWaitingMinutes": null,
    "maxStops": null,
    "requiredMeals": [],
    "mustVisit": [],
    "mustAvoidPlaces": [],
    "dietaryRestrictions": [],
    "accessibility": [],
    "transportModes": [],
    "safety": {
      "enabled": false,
      "forbiddenFlags": []
    },
    "budget": null,
    "budgetHard": null,
    "mustLeaveBy": 780
  },
  "soft": {
    "preferredCategories": [
      "scenic"
    ],
    "personas": [
      "photographer"
    ],
    "tripMode": null,
    "lowCrowd": false,
    "photography": true,
    "foodFocus": false,
    "family": false,
    "relaxed": false,
    "budget": null,
    "safety": false
  },
  "originCoords": [
    17.72,
    83.31
  ],
  "weather": null,
  "region": null,
  "now": null
}
```

**ITINERARY** — FEASIBLE

- **08:17–09:17 — Kailasagiri** (experience) — This is a high-value time window for the place; Lower predicted crowd; Weather suitability: Unknown
- **10:05–10:55 — Dolphin Nose Lighthouse** (experience) — Weather suitability: Unknown
- **11:20–12:35 — Yarada Beach** (experience) — Weather suitability: Unknown

**REQUIREMENT SATISFACTION:** 100/100

**WHY THIS SEQUENCE:** maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements

## 2. Afternoon

**USER REQUEST**

I have 6 hours from 1 PM. I want food, a museum and low travel time.

**REQUIREMENTS EXTRACTED**

```json
{
  "hard": {
    "startMin": 780,
    "endMin": 1140,
    "durationMin": 360,
    "excludedCategories": [],
    "maxTravelMinutes": null,
    "maxWaitingMinutes": null,
    "maxStops": null,
    "requiredMeals": [],
    "mustVisit": [],
    "mustAvoidPlaces": [],
    "dietaryRestrictions": [],
    "accessibility": [],
    "transportModes": [],
    "safety": {
      "enabled": false,
      "forbiddenFlags": []
    },
    "budget": null,
    "budgetHard": null,
    "mustLeaveBy": 1140
  },
  "soft": {
    "preferredCategories": [
      "food",
      "museum"
    ],
    "personas": [],
    "tripMode": null,
    "lowCrowd": false,
    "photography": false,
    "foodFocus": true,
    "family": false,
    "relaxed": false,
    "budget": null,
    "safety": false
  },
  "originCoords": [
    17.72,
    83.31
  ],
  "weather": null,
  "region": null,
  "now": null
}
```

**ITINERARY** — FEASIBLE

- **13:09–13:59 — Daspalla Restaurant** (lunch) — Fits lunch window; This is a high-value time window for the place; Weather suitability: Unknown
- **14:37–15:22 — Beach Food Court** (lunch) — Fits lunch window; Weather suitability: Unknown
- **15:45–16:45 — INS Kursura Submarine Museum** (experience) — Weather suitability: Unknown

**REQUIREMENT SATISFACTION:** 100/100

**WHY THIS SEQUENCE:** maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements

## 3. Evening

**USER REQUEST**

I have 4 hours from 4 PM. I want photography and sunset views.

**REQUIREMENTS EXTRACTED**

```json
{
  "hard": {
    "startMin": 960,
    "endMin": 1200,
    "durationMin": 240,
    "excludedCategories": [],
    "maxTravelMinutes": null,
    "maxWaitingMinutes": null,
    "maxStops": null,
    "requiredMeals": [],
    "mustVisit": [],
    "mustAvoidPlaces": [],
    "dietaryRestrictions": [],
    "accessibility": [],
    "transportModes": [],
    "safety": {
      "enabled": false,
      "forbiddenFlags": []
    },
    "budget": null,
    "budgetHard": null,
    "mustLeaveBy": 1200
  },
  "soft": {
    "preferredCategories": [
      "scenic"
    ],
    "personas": [
      "photographer"
    ],
    "tripMode": null,
    "lowCrowd": false,
    "photography": true,
    "foodFocus": false,
    "family": false,
    "relaxed": false,
    "budget": null,
    "safety": false
  },
  "originCoords": [
    17.72,
    83.31
  ],
  "weather": null,
  "region": null,
  "now": null
}
```

**ITINERARY** — FEASIBLE

- **16:12–17:12 — Kailasagiri** (experience) — This is a high-value time window for the place; Weather suitability: Unknown
- **18:02–18:52 — Dolphin Nose Lighthouse** (experience) — Weather suitability: Unknown

**REQUIREMENT SATISFACTION:** 100/100

**WHY THIS SEQUENCE:** maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements

## 4. Night

**USER REQUEST**

I have 3 hours from 7 PM. I want dinner and a relaxed evening.

**REQUIREMENTS EXTRACTED**

```json
{
  "hard": {
    "startMin": 1140,
    "endMin": 1320,
    "durationMin": 180,
    "excludedCategories": [],
    "maxTravelMinutes": null,
    "maxWaitingMinutes": null,
    "maxStops": null,
    "requiredMeals": [
      "dinner"
    ],
    "mustVisit": [],
    "mustAvoidPlaces": [],
    "dietaryRestrictions": [],
    "accessibility": [],
    "transportModes": [],
    "safety": {
      "enabled": false,
      "forbiddenFlags": []
    },
    "budget": null,
    "budgetHard": null,
    "mustLeaveBy": 1320
  },
  "soft": {
    "preferredCategories": [],
    "personas": [],
    "tripMode": "relaxed",
    "lowCrowd": false,
    "photography": false,
    "foodFocus": false,
    "family": false,
    "relaxed": true,
    "budget": null,
    "safety": false
  },
  "originCoords": [
    17.72,
    83.31
  ],
  "weather": null,
  "region": null,
  "now": null
}
```

**ITINERARY** — FEASIBLE

- **19:13–19:58 — Beach Food Court** (dinner) — Fits dinner window; Lower predicted crowd; Weather suitability: Unknown
- **20:35–21:25 — Daspalla Restaurant** (dinner) — Fits dinner window; This is a high-value time window for the place; Weather suitability: Unknown

**REQUIREMENT SATISFACTION:** 100/100

**WHY THIS SEQUENCE:** maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements

## 5. Food focused

**USER REQUEST**

I have 6 hours from noon. Food is the priority and I need lunch.

**REQUIREMENTS EXTRACTED**

```json
{
  "hard": {
    "startMin": 720,
    "endMin": 1080,
    "durationMin": 360,
    "excludedCategories": [],
    "maxTravelMinutes": null,
    "maxWaitingMinutes": null,
    "maxStops": null,
    "requiredMeals": [
      "lunch"
    ],
    "mustVisit": [],
    "mustAvoidPlaces": [],
    "dietaryRestrictions": [],
    "accessibility": [],
    "transportModes": [],
    "safety": {
      "enabled": false,
      "forbiddenFlags": []
    },
    "budget": null,
    "budgetHard": null,
    "mustLeaveBy": 1080
  },
  "soft": {
    "preferredCategories": [
      "food"
    ],
    "personas": [
      "food_lover"
    ],
    "tripMode": null,
    "lowCrowd": false,
    "photography": false,
    "foodFocus": true,
    "family": false,
    "relaxed": false,
    "budget": null,
    "safety": false
  },
  "originCoords": [
    17.72,
    83.31
  ],
  "weather": null,
  "region": null,
  "now": null
}
```

**ITINERARY** — FEASIBLE

- **12:09–12:59 — Daspalla Restaurant** (lunch) — Fits lunch window; Weather suitability: Unknown
- **13:24–14:14 — Dolphin Nose Lighthouse** (experience) — Weather suitability: Unknown
- **14:39–15:24 — Beach Food Court** (lunch) — Fits lunch window; Weather suitability: Unknown
- **15:48–16:48 — Kailasagiri** (experience) — Weather suitability: Unknown

**REQUIREMENT SATISFACTION:** 100/100

**WHY THIS SEQUENCE:** maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements

## 6. Photography

**USER REQUEST**

I have 6 hours from 2 PM. Maximize photography quality and scenic timing.

**REQUIREMENTS EXTRACTED**

```json
{
  "hard": {
    "startMin": 840,
    "endMin": 1200,
    "durationMin": 360,
    "excludedCategories": [],
    "maxTravelMinutes": null,
    "maxWaitingMinutes": null,
    "maxStops": null,
    "requiredMeals": [],
    "mustVisit": [],
    "mustAvoidPlaces": [],
    "dietaryRestrictions": [],
    "accessibility": [],
    "transportModes": [],
    "safety": {
      "enabled": false,
      "forbiddenFlags": []
    },
    "budget": null,
    "budgetHard": null,
    "mustLeaveBy": 1200
  },
  "soft": {
    "preferredCategories": [
      "scenic",
      "beach"
    ],
    "personas": [
      "photographer"
    ],
    "tripMode": null,
    "lowCrowd": false,
    "photography": true,
    "foodFocus": false,
    "family": false,
    "relaxed": false,
    "budget": null,
    "safety": false
  },
  "originCoords": [
    17.72,
    83.31
  ],
  "weather": null,
  "region": null,
  "now": null
}
```

**ITINERARY** — FEASIBLE

- **14:09–15:24 — Ramakrishna Beach** (experience) — Weather suitability: Unknown
- **15:47–16:47 — Kailasagiri** (experience) — Weather suitability: Unknown
- **17:11–18:11 — Night Market** (experience) — Weather suitability: Unknown
- **18:44–19:34 — Dolphin Nose Lighthouse** (experience) — Lower predicted crowd; Weather suitability: Unknown

**REQUIREMENT SATISFACTION:** 100/100

**WHY THIS SEQUENCE:** maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements

## 7. Family

**USER REQUEST**

I have 6 hours from 10 AM. Plan a comfortable family-friendly day.

**REQUIREMENTS EXTRACTED**

```json
{
  "hard": {
    "startMin": 600,
    "endMin": 960,
    "durationMin": 360,
    "excludedCategories": [],
    "maxTravelMinutes": null,
    "maxWaitingMinutes": null,
    "maxStops": null,
    "requiredMeals": [],
    "mustVisit": [],
    "mustAvoidPlaces": [],
    "dietaryRestrictions": [],
    "accessibility": [],
    "transportModes": [],
    "safety": {
      "enabled": false,
      "forbiddenFlags": []
    },
    "budget": null,
    "budgetHard": null,
    "mustLeaveBy": 960
  },
  "soft": {
    "preferredCategories": [],
    "personas": [
      "family"
    ],
    "tripMode": "family",
    "lowCrowd": false,
    "photography": false,
    "foodFocus": false,
    "family": true,
    "relaxed": false,
    "budget": null,
    "safety": false
  },
  "originCoords": [
    17.72,
    83.31
  ],
  "weather": null,
  "region": null,
  "now": null
}
```

**ITINERARY** — FEASIBLE

- **10:09–11:09 — INS Kursura Submarine Museum** (experience) — This is a high-value time window for the place; Weather suitability: Unknown
- **11:33–12:48 — Ramakrishna Beach** (experience) — Weather suitability: Unknown
- **13:15–14:05 — Dolphin Nose Lighthouse** (experience) — Weather suitability: Unknown
- **14:29–15:44 — Yarada Beach** (experience) — Weather suitability: Unknown

**REQUIREMENT SATISFACTION:** 100/100

**WHY THIS SEQUENCE:** maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements

## 8. Low crowd

**USER REQUEST**

I have 6 hours from 8 AM. Avoid crowded places and keep the trip relaxed.

**REQUIREMENTS EXTRACTED**

```json
{
  "hard": {
    "startMin": 480,
    "endMin": 840,
    "durationMin": 360,
    "excludedCategories": [],
    "maxTravelMinutes": null,
    "maxWaitingMinutes": null,
    "maxStops": null,
    "requiredMeals": [],
    "mustVisit": [],
    "mustAvoidPlaces": [],
    "dietaryRestrictions": [],
    "accessibility": [],
    "transportModes": [],
    "safety": {
      "enabled": false,
      "forbiddenFlags": []
    },
    "budget": null,
    "budgetHard": null,
    "mustLeaveBy": 840
  },
  "soft": {
    "preferredCategories": [],
    "personas": [
      "low_crowd"
    ],
    "tripMode": "relaxed",
    "lowCrowd": true,
    "photography": false,
    "foodFocus": false,
    "family": false,
    "relaxed": true,
    "budget": null,
    "safety": false
  },
  "originCoords": [
    17.72,
    83.31
  ],
  "weather": null,
  "region": null,
  "now": null
}
```

**ITINERARY** — FEASIBLE

- **08:17–09:17 — Kailasagiri** (experience) — This is a high-value time window for the place; Lower predicted crowd; Weather suitability: Unknown
- **09:45–11:00 — Ramakrishna Beach** (experience) — Weather suitability: Unknown
- **11:27–12:17 — Dolphin Nose Lighthouse** (experience) — Weather suitability: Unknown
- **12:41–13:56 — Yarada Beach** (experience) — Weather suitability: Unknown

**REQUIREMENT SATISFACTION:** 100/100

**WHY THIS SEQUENCE:** maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements

## 9. Beach + food

**USER REQUEST**

I have 7 hours from 1 PM. I want beaches, good food and no temples.

**REQUIREMENTS EXTRACTED**

```json
{
  "hard": {
    "startMin": 780,
    "endMin": 1200,
    "durationMin": 420,
    "excludedCategories": [
      "temple"
    ],
    "maxTravelMinutes": null,
    "maxWaitingMinutes": null,
    "maxStops": null,
    "requiredMeals": [
      "lunch"
    ],
    "mustVisit": [],
    "mustAvoidPlaces": [],
    "dietaryRestrictions": [],
    "accessibility": [],
    "transportModes": [],
    "safety": {
      "enabled": false,
      "forbiddenFlags": []
    },
    "budget": null,
    "budgetHard": null,
    "mustLeaveBy": 1200
  },
  "soft": {
    "preferredCategories": [
      "beach",
      "food"
    ],
    "personas": [],
    "tripMode": null,
    "lowCrowd": false,
    "photography": false,
    "foodFocus": true,
    "family": false,
    "relaxed": false,
    "budget": null,
    "safety": false
  },
  "originCoords": [
    17.72,
    83.31
  ],
  "weather": null,
  "region": null,
  "now": null
}
```

**ITINERARY** — FEASIBLE

- **13:09–13:54 — Beach Food Court** (lunch) — Fits lunch window; This is a high-value time window for the place; Weather suitability: Unknown
- **14:17–15:32 — Ramakrishna Beach** (experience) — Weather suitability: Unknown
- **16:09–17:24 — Yarada Beach** (experience) — Weather suitability: Unknown
- **18:26–19:16 — Daspalla Restaurant** (snack) — Fits snack window; Lower predicted crowd; Weather suitability: Unknown

**REQUIREMENT SATISFACTION:** 100/100

**WHY THIS SEQUENCE:** maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements

## 10. Rain scenario

**USER REQUEST**

I have 5 hours from 2 PM. Heavy rain is expected until 4 PM, then it clears. Adapt the itinerary.

**REQUIREMENTS EXTRACTED**

```json
{
  "hard": {
    "startMin": 840,
    "endMin": 1140,
    "durationMin": 300,
    "excludedCategories": [],
    "maxTravelMinutes": null,
    "maxWaitingMinutes": null,
    "maxStops": null,
    "requiredMeals": [],
    "mustVisit": [],
    "mustAvoidPlaces": [],
    "dietaryRestrictions": [],
    "accessibility": [],
    "transportModes": [],
    "safety": {
      "enabled": false,
      "forbiddenFlags": []
    },
    "budget": null,
    "budgetHard": null,
    "mustLeaveBy": 1140
  },
  "soft": {
    "preferredCategories": [
      "museum",
      "beach",
      "scenic"
    ],
    "personas": [],
    "tripMode": null,
    "lowCrowd": false,
    "photography": true,
    "foodFocus": false,
    "family": false,
    "relaxed": false,
    "budget": null,
    "safety": false
  },
  "originCoords": [
    17.72,
    83.31
  ],
  "weather": {
    "hourly": [
      {
        "time": "14:00",
        "tempC": 27,
        "condition": "Heavy Rain"
      },
      {
        "time": "15:00",
        "tempC": 27,
        "condition": "Heavy Rain"
      },
      {
        "time": "16:00",
        "tempC": 28,
        "condition": "Clear"
      },
      {
        "time": "17:00",
        "tempC": 28,
        "condition": "Clear"
      },
      {
        "time": "18:00",
        "tempC": 28,
        "condition": "Clear"
      }
    ]
  },
  "region": null,
  "now": null
}
```

**ITINERARY** — FEASIBLE

- **14:09–15:09 — INS Kursura Submarine Museum** (experience) — Lower predicted crowd; Weather suitability: Fair
- **16:03–17:18 — Yarada Beach** (experience) — Weather suitability: Excellent
- **17:48–18:38 — Dolphin Nose Lighthouse** (experience) — This is a high-value time window for the place; Weather suitability: Excellent

**REQUIREMENT SATISFACTION:** 100/100

**WHY THIS SEQUENCE:** maximize whole-itinerary experience under hard constraints, time-dependent place states, meals, routing, weather, crowd, scenic windows and budget/accessibility/safety requirements

