import {fetchTESDepartures} from './hafas.js'
import {appendRecord, loadHistory} from './store.js'

const POLL_INTERVAL = 120_000 // 120 seconds

// Per-station latest snapshots: Map<stationId, record>
const latestSnapshots = new Map()
let stations = []

async function pollStation(station) {
	try {
		const departures = await fetchTESDepartures(station.id)
		const record = {
			fetchedAt: new Date().toISOString(),
			departures,
		}

		latestSnapshots.set(station.id, record)
		await appendRecord(record, station.id, station.name)

		const maxDelay = departures.reduce((max, d) => Math.max(max, d.delayMinutes || 0), 0)
		console.log(`[${new Date().toLocaleTimeString()}] ${station.name}: ${departures.length} TES departure(s), max delay ${maxDelay} min`)
	} catch (err) {
		console.error(`[${new Date().toLocaleTimeString()}] Poll error (${station.name}):`, err.message)
	}
}

async function pollAll() {
	await Promise.all(stations.map(s => pollStation(s)))
}

export function startPolling(stationList) {
	stations = stationList

	// Immediate first poll
	pollAll()

	// Then every 120 seconds
	setInterval(pollAll, POLL_INTERVAL)
}

export function getLatestSnapshot(stationId) {
	return latestSnapshots.get(stationId) || null
}

export async function getHistory(stationId, hours = 24) {
	const history = await loadHistory(stationId)
	const cutoff = Date.now() - hours * 60 * 60 * 1000
	const filtered = history.records.filter(r => new Date(r.fetchedAt).getTime() > cutoff)

	return filtered.map(record => {
		const deps = record.departures
		const delayed = deps.filter(d => d.delay != null && d.delay > 0)
		const delays = deps.filter(d => d.delay != null).map(d => d.delayMinutes)
		const avgDelay = delays.length > 0 ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null
		const maxDelay = delays.length > 0 ? Math.max(...delays) : null

		return {
			fetchedAt: record.fetchedAt,
			departureCount: deps.length,
			delayedCount: delayed.length,
			cancelledCount: deps.filter(d => d.cancelled).length,
			avgDelayMinutes: avgDelay,
			maxDelayMinutes: maxDelay,
		}
	})
}
