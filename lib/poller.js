import {fetchTESDepartures} from './hafas.js'
import {appendRecord, loadHistory} from './store.js'

const POLL_INTERVAL = 120_000 // 120 seconds

let latestSnapshot = null
let stationId = null
let stationName = null

async function poll() {
	try {
		const departures = await fetchTESDepartures(stationId)
		const record = {
			fetchedAt: new Date().toISOString(),
			departures,
		}

		latestSnapshot = record
		await appendRecord(record, stationId, stationName)

		const maxDelay = departures.reduce((max, d) => Math.max(max, d.delayMinutes || 0), 0)
		console.log(`[${new Date().toLocaleTimeString()}] Polled: ${departures.length} TES departure(s), max delay ${maxDelay} min`)
	} catch (err) {
		console.error(`[${new Date().toLocaleTimeString()}] Poll error:`, err.message)
	}
}

export function startPolling(id, name) {
	stationId = id
	stationName = name

	// Immediate first poll
	poll()

	// Then every 120 seconds
	setInterval(poll, POLL_INTERVAL)
}

export function getLatestSnapshot() {
	return latestSnapshot
}

export async function getHistory(hours = 24) {
	const history = await loadHistory()
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
