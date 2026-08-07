// lib/httpAgent.js — Shared keep-alive HTTPS agent for outbound API calls
//
// node-fetch (and Node's http/https modules generally) open a brand new
// TCP+TLS connection for every single request unless an agent with
// keepAlive is explicitly passed — the default agent does NOT reuse
// sockets. Every outbound call this server makes (Gemini, Nominatim,
// Photon, Wikipedia, Open-Meteo) is HTTPS, and under real traffic these
// hosts get hit constantly — paying a fresh TCP handshake + TLS handshake
// (2-3 extra round trips each) on every single request adds real,
// avoidable latency (often 100-300ms+ depending on the target's distance
// from wherever this is deployed) and churns file descriptors under load.
//
// A single shared keep-alive agent lets Node reuse already-established
// connections to the same host across requests/workers, so only the FIRST
// request to a given host pays the handshake cost; everything after reuses
// the warm socket. Pass this as the `agent` option to every outbound
// fetch() call in the app (see services/gemini.js, services/placesDiscovery.js,
// routes/weather.js, routes/weather-alerts.js, routes/geocode.js).
//
// Safe to share across all outbound hosts — Node's HTTPS agent pools
// sockets per-host internally, so this one instance doesn't mix
// connections between e.g. generativelanguage.googleapis.com and
// nominatim.openstreetmap.org.
const https = require('https');

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000, // TCP keep-alive probe interval — keeps idle sockets alive through NATs/load balancers that would otherwise silently drop them
  maxSockets: 50,        // per-host cap — generous for this app's concurrency without being unbounded
  maxFreeSockets: 10,    // idle sockets kept warm per host between requests
});

module.exports = { keepAliveAgent };
