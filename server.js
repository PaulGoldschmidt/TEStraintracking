import express from 'express'
import {findStationId} from './lib/hafas.js'
import {startPolling, getLatestSnapshot, getHistory} from './lib/poller.js'
import {closeDb} from './lib/db.js'

const PORT = process.env.PORT || 3000

const STATION_QUERIES = [
	'Tesla Süd',
	'Berlin Ostbahnhof',
	'Berlin Ostkreuz',
	'Erkner Bhf',
]

let resolvedStations = [] // [{id, name, query}]

const app = express()
app.use(express.static('public'))

// API: list available stations
app.get('/api/stations', (req, res) => {
	res.json(resolvedStations.map(s => ({id: s.id, name: s.name})))
})

// API: current status for a station
app.get('/api/status', (req, res) => {
	const stationId = req.query.station
	const station = resolvedStations.find(s => s.id === stationId)
	if (!station) {
		return res.status(400).json({error: 'Unknown station. Use /api/stations to list available stations.'})
	}

	const snapshot = getLatestSnapshot(stationId)
	if (!snapshot) {
		return res.json({stationName: station.name, stationId, fetchedAt: null, departures: [], summary: null})
	}

	const deps = snapshot.departures
	const withDelay = deps.filter(d => d.delay != null)
	const delayed = withDelay.filter(d => d.delay > 0)
	const onTime = withDelay.filter(d => d.delay <= 0)
	const cancelled = deps.filter(d => d.cancelled)
	const delays = withDelay.map(d => d.delayMinutes)

	const summary = {
		totalDepartures: deps.length,
		onTime: onTime.length,
		delayed: delayed.length,
		cancelled: cancelled.length,
		maxDelayMinutes: delays.length > 0 ? Math.max(...delays) : null,
		avgDelayMinutes: delays.length > 0 ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null,
	}

	res.json({
		stationName: station.name,
		stationId,
		fetchedAt: snapshot.fetchedAt,
		departures: deps,
		summary,
	})
})

// API: historical data for a station
app.get('/api/history', async (req, res) => {
	const stationId = req.query.station
	const station = resolvedStations.find(s => s.id === stationId)
	if (!station) {
		return res.status(400).json({error: 'Unknown station. Use /api/stations to list available stations.'})
	}

	const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 8760)
	const records = await getHistory(stationId, hours)
	res.json({stationName: station.name, stationId, hours, records})
})

// Start
async function main() {
	try {
		console.log('Resolving stations...')
		resolvedStations = await Promise.all(
			STATION_QUERIES.map(async (query) => {
				const station = await findStationId(query)
				return {id: station.id, name: station.name, query}
			})
		)

		console.log(`Tracking ${resolvedStations.length} stations:`)
		for (const s of resolvedStations) {
			console.log(`  - ${s.name} (${s.id})`)
		}

		startPolling(resolvedStations)

		app.listen(PORT, () => {
			console.log(`Server running at http://localhost:${PORT}`)
		})
	} catch (err) {
		console.error('Fatal:', err.message)
		process.exit(1)
	}
}

main()

process.on('SIGTERM', () => { closeDb(); process.exit(0) })
process.on('SIGINT', () => { closeDb(); process.exit(0) })
