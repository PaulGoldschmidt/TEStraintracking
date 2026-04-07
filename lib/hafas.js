import {createClient} from 'hafas-client'
import {profile as bvgProfile} from 'hafas-client/p/bvg/index.js'

const client = createClient(bvgProfile, 'TES-Gigatrain-Tracker github.com/PaulGoldschmidt/TEStraintracking')

export async function findStationId(name) {
	const locations = await client.locations(name, {results: 5})
	const stop = locations.find(l => l.type === 'stop' || l.type === 'station')
	if (!stop) {
		throw new Error(`Station "${name}" not found in HAFAS`)
	}
	console.log(`Resolved station: "${stop.name}" (ID: ${stop.id})`)
	return {id: stop.id, name: stop.name}
}

export async function fetchTESDepartures(stationId) {
	const res = await client.departures(stationId, {duration: 120})
	const departures = res.departures || res

	return departures
		.filter(dep => dep.line && dep.line.name && dep.line.name.toUpperCase().includes('TES'))
		.map(dep => ({
			tripId: dep.tripId,
			lineName: dep.line.name,
			direction: dep.direction || '',
			plannedWhen: dep.plannedWhen,
			when: dep.when,
			delay: dep.delay,
			delayMinutes: dep.delay != null ? Math.round(dep.delay / 60) : null,
			platform: dep.platform || null,
			cancelled: dep.cancelled || false,
		}))
}
