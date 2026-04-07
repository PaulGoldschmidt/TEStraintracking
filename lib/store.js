import {readFile, writeFile, rename, mkdir} from 'node:fs/promises'
import {join} from 'node:path'

const DATA_DIR = join(process.cwd(), 'data')
const RETENTION_DAYS = 7

function dataFile(stationId) {
	return join(DATA_DIR, `delays-${stationId}.json`)
}

async function ensureDir() {
	await mkdir(DATA_DIR, {recursive: true})
}

export async function loadHistory(stationId) {
	try {
		const raw = await readFile(dataFile(stationId), 'utf-8')
		return JSON.parse(raw)
	} catch (err) {
		if (err.code === 'ENOENT') {
			return {stationId, stationName: null, records: []}
		}
		console.error(`Warning: could not parse delays-${stationId}.json, starting fresh:`, err.message)
		return {stationId, stationName: null, records: []}
	}
}

async function saveHistory(stationId, data) {
	await ensureDir()
	const file = dataFile(stationId)
	const tmp = file + '.tmp'
	await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
	await rename(tmp, file)
}

export async function appendRecord(record, stationId, stationName) {
	const history = await loadHistory(stationId)
	history.stationId = stationId
	history.stationName = stationName
	history.records.push(record)

	// Prune records older than retention period
	const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
	history.records = history.records.filter(r => new Date(r.fetchedAt).getTime() > cutoff)

	await saveHistory(stationId, history)
}
