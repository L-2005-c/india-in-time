# Itinerary Optimizer API Documentation

## Overview

The Itinerary Optimizer is a smart travel planning feature that:
- Groups nearby places into efficient clusters
- Optimizes route order to minimize travel distance
- Allocates time based on place types and cluster sizes
- Provides realistic place-to-place navigation

## Base URL
```
/api/itinerary
```

## Rate Limiting
- **Limit**: 100 requests per 15 minutes (generalLimiter)
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Endpoints

### 1. POST `/api/itinerary/optimize`

Build an optimized itinerary with nearby place clustering.

#### Request

```json
{
  "places": [
    {
      "name": "Taj Mahal",
      "coords": [27.1751, 78.0421],
      "category": "monument",
      "openingTime": "06:00",
      "closingTime": "18:00"
    },
    {
      "name": "Agra Fort",
      "coords": [27.1809, 78.0064],
      "category": "monument",
      "openingTime": "06:00",
      "closingTime": "18:30"
    },
    {
      "name": "Local Restaurant",
      "coords": [27.1800, 78.0100],
      "category": "food",
      "openingTime": "11:00",
      "closingTime": "23:00"
    }
  ],
  "startCoord": [27.1751, 78.0421],
  "endCoord": [27.1800, 78.0200],
  "totalMinutes": 480,
  "preferNearby": true,
  "clusterRadiusKm": 1.5
}
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `places` | Array | Yes | Array of place objects with `name`, `coords` [lat, lon], `category` |
| `startCoord` | Array | Yes | Starting location [latitude, longitude] |
| `endCoord` | Array | No | End/return location [latitude, longitude] |
| `totalMinutes` | Number | Yes | Total time available for the itinerary (in minutes) |
| `preferNearby` | Boolean | No | Group nearby places together (default: true) |
| `clusterRadiusKm` | Number | No | Radius for place clustering (default: 1.5 km) |

#### Response

```json
{
  "itinerary": [
    {
      "order": 1,
      "mainPlace": {
        "name": "Taj Mahal",
        "coords": [27.1751, 78.0421],
        "category": "monument"
      },
      "nearbyPlaces": [
        {
          "place": {
            "name": "Local Restaurant",
            "coords": [27.1800, 78.0100],
            "category": "food"
          },
          "distFromMain": 0.65
        }
      ],
      "visitTime": {
        "startTime": 0,
        "mainPlaceMinutes": 60,
        "nearbyPlaceMinutesEach": 30,
        "totalClusterMinutes": 90
      },
      "distance": {
        "travelToClusterKm": 0,
        "travelTimeMinutes": 0
      },
      "stats": {
        "totalInCluster": 2,
        "nearbyCount": 1
      }
    },
    {
      "order": 2,
      "mainPlace": {
        "name": "Agra Fort",
        "coords": [27.1809, 78.0064],
        "category": "monument"
      },
      "nearbyPlaces": [],
      "visitTime": {
        "startTime": 90,
        "mainPlaceMinutes": 60,
        "nearbyPlaceMinutesEach": 30,
        "totalClusterMinutes": 60
      },
      "distance": {
        "travelToClusterKm": 1.2,
        "travelTimeMinutes": 5
      },
      "stats": {
        "totalInCluster": 1,
        "nearbyCount": 0
      }
    }
  ],
  "summary": {
    "totalPlaces": 3,
    "clusterCount": 2,
    "totalTime": 155,
    "allocatedMinutes": 480,
    "strategy": "nearby-clustering"
  },
  "returnJourney": {
    "destination": [27.1800, 78.0200],
    "distanceKm": 0.85,
    "estimatedMinutes": 3
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `itinerary` | Array | Ordered list of place clusters to visit |
| `order` | Number | Sequence number (1, 2, 3, ...) |
| `mainPlace` | Object | Primary attraction in the cluster |
| `nearbyPlaces` | Array | Other places within cluster radius, with distance |
| `visitTime` | Object | Timing info for this cluster |
| `distance` | Object | Travel info to reach this cluster |
| `stats` | Object | Cluster statistics |
| `summary` | Object | Overall itinerary stats |
| `returnJourney` | Object | Info about returning to end location |

#### Example Usage (JavaScript)

```javascript
// Frontend example
async function createOptimizedItinerary() {
  const discoveredPlaces = [
    { name: 'Taj Mahal', coords: [27.1751, 78.0421], category: 'monument' },
    { name: 'Agra Fort', coords: [27.1809, 78.0064], category: 'monument' },
    { name: 'Mehtab Bagh', coords: [27.2065, 78.0447], category: 'garden' }
  ];

  const response = await fetch('/api/itinerary/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      places: discoveredPlaces,
      startCoord: [27.1751, 78.0421],
      totalMinutes: 480,  // 8 hours
      preferNearby: true,
      clusterRadiusKm: 1.5
    })
  });

  const result = await response.json();
  
  if (result.error) {
    console.error('Optimization failed:', result.error);
    return;
  }

  // Display itinerary to user
  result.itinerary.forEach(cluster => {
    console.log(`${cluster.order}. ${cluster.mainPlace.name}`);
    console.log(`   Visit: ${cluster.visitTime.mainPlaceMinutes} min`);
    console.log(`   Nearby: ${cluster.nearbyPlaces.length} places`);
  });
}
```

---

### 2. POST `/api/itinerary/cluster`

Find and cluster nearby places around a specific location.

#### Request

```json
{
  "places": [
    {
      "name": "Taj Mahal",
      "coords": [27.1751, 78.0421],
      "category": "monument"
    },
    {
      "name": "Local Restaurant",
      "coords": [27.1800, 78.0100],
      "category": "food"
    }
  ],
  "centerCoord": [27.1751, 78.0421],
  "radiusKm": 2
}
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `places` | Array | Yes | Array of place objects with `name`, `coords` [lat, lon] |
| `centerCoord` | Array | Yes | Center location [latitude, longitude] |
| `radiusKm` | Number | No | Search radius in kilometers (default: 2 km) |

#### Response

```json
{
  "centerCoord": [27.1751, 78.0421],
  "radiusKm": 2,
  "foundPlaces": 2,
  "clusters": [
    {
      "mainPlace": {
        "name": "Taj Mahal",
        "coords": [27.1751, 78.0421],
        "category": "monument"
      },
      "nearbyCount": 1,
      "totalInCluster": 2,
      "centerCoord": [27.1751, 78.0421],
      "radius": 1.5
    }
  ]
}
```

#### Example Usage (JavaScript)

```javascript
async function findNearbyPlaces(places, centerLat, centerLon) {
  const response = await fetch('/api/itinerary/cluster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      places: places,
      centerCoord: [centerLat, centerLon],
      radiusKm: 2
    })
  });

  const result = await response.json();
  console.log(`Found ${result.foundPlaces} places nearby`);
  console.log(`Grouped into ${result.clusters.length} clusters`);
  
  return result.clusters;
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Missing lat/lon"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to optimize itinerary"
}
```

---

## Best Practices

### 1. Coordinate Format
Always use [latitude, longitude]:
```javascript
// ✅ Correct
[27.1751, 78.0421]

// ❌ Wrong
[78.0421, 27.1751]
```

### 2. Time Allocation
- Total time includes travel and visits
- Each place gets: `totalMinutes / numberOfPlaces`
- Nearby places split time equally
- Minimum 5 min for travel, 10+ min per place

### 3. Cluster Radius
- **1.0 km** - Tight clusters, very walkable
- **1.5 km** - Balanced, typical tourist area
- **2.0 km** - Loose clusters, may need transport

### 4. Place Categories
Use standard categories for better optimization:
- `monument` - Historical sites
- `temple` - Religious sites
- `food` - Restaurants/cafes
- `garden` - Parks/gardens
- `museum` - Museums
- `scenic` - Viewpoints
- `shopping` - Markets/shops
- `beach` - Beaches/water

### 5. Caching
- Results cached for 30 minutes
- Cache key: city + coordinates + preferences
- Same request returns cached result

---

## Performance Tips

### Optimize Requests
```javascript
// ✅ Good: Send clustered places
const places = discoveredPlaces.slice(0, 20); // Limit to 20

// ❌ Bad: Send 100+ places
const places = allPlaces; // Too many!
```

### Handle Rate Limits
```javascript
const response = await fetch('/api/itinerary/optimize', { ... });

// Check rate limit headers
const remaining = response.headers.get('X-RateLimit-Remaining');
const reset = response.headers.get('X-RateLimit-Reset');

if (remaining < 5) {
  console.warn('Approaching rate limit');
}
```

### Implement Retry Logic
```javascript
async function optimizeWithRetry(data, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('/api/itinerary/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (response.status === 429) { // Rate limited
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      
      return await response.json();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
```

---

## Monitoring & Analytics

Track these metrics:
- **Request volume** - `/api/itinerary/optimize` vs `/api/itinerary/cluster`
- **Response time** - Should be < 2 seconds
- **Error rate** - Should be < 1%
- **Cache hit ratio** - Higher is better
- **Average cluster size** - Indicates data quality

---

## FAQ

**Q: Why are some nearby places not grouped?**
A: Places must be within `clusterRadiusKm` AND share significant name similarities to avoid false grouping.

**Q: Can I customize time allocation per place?**
A: Currently uses automatic calculation. Custom allocation coming in v2.

**Q: Does it work internationally?**
A: Yes! Works with any coordinates globally.

**Q: What's the maximum number of places?**
A: Tested with 50+ places. Recommended max: 30 for best UX.

---

## Support

For issues or feature requests:
- GitHub Issues: [india-in-time/issues](https://github.com/L-2005-c/india-in-time/issues)
- API Status: `/api/health`
- Detailed Metrics: `/api/health/ready` (admin only)
