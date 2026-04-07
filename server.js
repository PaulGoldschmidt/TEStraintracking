import express from 'express'
import {findStationId} from './lib/hafas.js'
import {startPolling, getLatestSnapshot, getHistory} from './lib/poller.js'

const PORT = process.env.PORT || 3000
const STATION_QUERY = process.env.STATION || 'Tesla Süd'

const app = express()
app.use(express.static('public'))

// API: current status
app.get('/api/status', (req, res) => {
	const snapshot = getLatestSnapshot()
	if (!snapshot) {
		return res.json({stationName: null, fetchedAt: null, departures: [], summary: null})
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
		stationName: STATION_QUERY,
		fetchedAt: snapshot.fetchedAt,
		departures: deps,
		summary,
	})
})

// API: historical data
app.get('/api/history', async (req, res) => {
	const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 168)
	const records = await getHistory(hours)
	res.json({stationName: STATION_QUERY, hours, records})
})

// Start
async function main() {
	try {
		const station = await findStationId(STATION_QUERY)
		console.log(`Tracking TES Gigatrain departures from: ${station.name}`)

		startPolling(station.id, station.name)

		app.listen(PORT, () => {
			console.log(`Server running at http://localhost:${PORT}`)
		})
	} catch (err) {
		console.error('Fatal:', err.message)
		process.exit(1)
	}
}

main()
