# Advanced Itinerary Engine v4

## Day structure (phases)

| Phase | Time | Prefers |
|-------|------|---------|
| Morning | 05:00–11:30 | beach, temple, scenic, fort, park |
| Lunch | 11:30–15:00 | **food** |
| Afternoon | 15:00–17:30 | museum, fort, temple, park, scenic |
| Golden hour | 17:30–19:00 | beach, scenic |
| Dinner | 19:00–22:00 | **food** |
| Night | 22:00–24:00 | market, scenic, food |

## Pipeline

1. Beam-search geo-temporal optimization (visit score × timing fit × route × preferences)
2. Phase bonus from `dayStructure.js`
3. Hard skip of &lt;20% timing-fit fillers
4. Meal-window scoring for food
5. **Post-repair**: insert lunch/dinner food if user asked for food but beam missed it
6. Coverage diagnostics on response (`dayStructure` field)

## Client fallback

`timeAwarePlanner.js` uses the same meal-anchor + category rules when the API is offline.
