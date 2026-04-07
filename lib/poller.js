import {fetchTESDepartures} from './hafas.js'
import {appendRecord, getHistoryStats} from './db.js'

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
		appendRecord(record, station.id, station.name)

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

export function getHistory(stationId, hours = 24) {
	return getHistoryStats(stationId, hours)
}
