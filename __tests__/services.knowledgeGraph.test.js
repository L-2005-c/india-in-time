'use strict';

const {
  TourismKnowledgeGraph,
  buildKnowledgeGraph,
} = require('../services/travelIntelligence/knowledgeGraph');

describe('Tourism Knowledge Graph Engine (knowledgeGraph.js)', () => {
  const mockPlaces = [
    { id: '1', name: 'RK Beach', cat: 'beach', coords: [17.7126, 83.3235], rating: 4.5, is_sunset_spot: true },
    { id: '2', name: 'Submarine Museum', cat: 'museum', coords: [17.7165, 83.3323], rating: 4.6 },
    { id: '3', name: 'Sea Breeze Restaurant', cat: 'food', coords: [17.7150, 83.3300], rating: 4.4 },
    { id: '4', name: 'Distant Hilltop', cat: 'hill', coords: [17.9000, 83.5000], rating: 4.2 },
  ];

  test('builds city graph and connects nearby and culinary entities', () => {
    const graph = buildKnowledgeGraph(mockPlaces);
    expect(graph.nodes.size).toBe(4);

    const nearbyRk = graph.queryNearby('1', 2.0);
    expect(nearbyRk.length).toBeGreaterThan(0);
    expect(nearbyRk.some(n => n.node.name === 'Submarine Museum')).toBe(true);

    const diningNearRk = graph.queryDiningNear('1', 2);
    expect(diningNearRk.length).toBeGreaterThan(0);
    expect(diningNearRk[0].node.name === 'Sea Breeze Restaurant');
  });

  test('tracks edge provenance and confidence metadata', () => {
    const graph = new TourismKnowledgeGraph();
    graph.addNode({ id: 'p1', name: 'Place 1', coords: [17.7, 83.3] });
    graph.addNode({ id: 'p2', name: 'Place 2', coords: [17.71, 83.31] });
    graph.addEdge('p1', 'p2', 'NEAR', { distanceM: 1200, source: 'geo_road_network', confidence: 95 });

    const edges = graph.edges.get('p1');
    expect(edges[0].metadata.source).toBe('geo_road_network');
    expect(edges[0].metadata.confidence).toBe(95);
    expect(edges[0].metadata.lastVerified).toBeDefined();
  });
});
